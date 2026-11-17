import { routeApplication } from "./application-channels.js";
import { assessApplication, executeApplication } from "./application-executor.js";
import { zeroExperienceEvidence } from "./zero-experience.js";
// Personal workspace API. Mount only after configuring D1 and ADMIN_PASSWORD_HASH.
// Password hash format: PBKDF2 SHA-256 with 100000 iterations, base64 salt and digest.
const AUTH_ORIGIN = "https://tovi-donninger.github.io";
const encoder = new TextEncoder();
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
async function sha256(text) { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)))); }
function b64bytes(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
async function checkPassword(password, config) {
  const [iterations, salt, expected] = String(config || "").split(":");
  if (iterations !== "100000" || !salt || !expected || password.length > 1024) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: b64bytes(salt), iterations: 100000, hash: "SHA-256" }, key, 256));
  const expectedBytes = b64bytes(expected);
  let difference = bits.length ^ expectedBytes.length;
  for (let i = 0; i < bits.length; i++) difference |= bits[i] ^ (expectedBytes[i] || 0);
  return difference === 0;
}
function response(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": AUTH_ORIGIN, "Vary": "Origin", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS" } }); }
function tokenFrom(request) { const match = /^Bearer ([a-f0-9]{64})$/.exec(request.headers.get("Authorization") || ""); return match?.[1] || ""; }
async function authorized(request, db) {
  const token = tokenFrom(request);
  if (!token) return false;
  const hash = await sha256(token);
  const record = await db.prepare("SELECT token_hash FROM auth_sessions WHERE token_hash = ? AND expires_at > datetime('now')").bind(hash).first();
  return !!record;
}
function validProfile(p) {
  if (!p || typeof p !== "object" || Array.isArray(p)) return false;
  const fields = ["firstName","lastName","email","phone","city","country","address","linkedin","headline","education","experience","skills","cv","coverLetter","minimumSalary","locations","roles","notes"];
  return Object.keys(p).every(k => fields.includes(k) && typeof p[k] === "string" && p[k].length <= 30000);
}
const statuses = ["Discovered","Prepared","Submitted","Interview","Rejected","Blocked"];
export async function personalApi(request, env, url, searchHandler) {
  if (!env.DB || !env.ADMIN_PASSWORD_HASH) return response({error:"Secure workspace is not configured. Set the D1 DB binding and ADMIN_PASSWORD_HASH secret."},503);
  const path = url.pathname;
  const method = request.method;
  if (path === "/api/private/login" && method === "POST") {
    // Persistent rate limit across Worker instances: five attempts per 15 minutes.
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE attempted_at > datetime('now','-15 minutes')").first();
    if (Number(count?.n || 0) >= 5) return response({error:"Too many login attempts. Try again in 15 minutes."},429);
    let body; try { body = await request.json(); } catch { return response({error:"Invalid JSON"},400); }
    if (typeof body.password !== "string" || body.password.length > 1024) return response({error:"Invalid password"},400);
    await env.DB.prepare("INSERT INTO auth_attempts DEFAULT VALUES").run();
    if (!(await checkPassword(body.password, env.ADMIN_PASSWORD_HASH))) return response({error:"Incorrect password"},401);
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const hash = await sha256(token);
    await env.DB.prepare("INSERT INTO auth_sessions(token_hash, expires_at) VALUES (?, datetime('now','+12 hours'))").bind(hash).run();
    await env.DB.prepare("DELETE FROM auth_attempts").run();
    await env.DB.prepare("DELETE FROM auth_sessions WHERE expires_at <= datetime('now')").run();
    return response({token,expiresInSeconds:43200});
  }
  // Dedicated machine credential: read-only access to screened job handoffs.
  // Never authorize profile edits, queue mutations, or application submission with this key.
  const machinePaths=new Set(["/api/private/recruitment/application-executor/handoff","/api/private/recruitment/application-executor/receipt","/api/private/recruitment/application-executor/next","/api/private/recruitment/discover"]);
  let machineAuthorized=false;
  if(machinePaths.has(path)&&method==="POST"&&env.CAREERFINDER_AUTOMATION_KEY){
    const supplied=request.headers.get("X-CareerFinder-Automation-Key")||"";
    if(/^[a-f0-9]{64}$/.test(supplied)&&/^[a-f0-9]{64}$/.test(env.CAREERFINDER_AUTOMATION_KEY)){
      const a=encoder.encode(supplied),b=encoder.encode(env.CAREERFINDER_AUTOMATION_KEY);
      let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
      machineAuthorized=diff===0;
    }
  }
  if (!machineAuthorized && !(await authorized(request, env.DB))) return response({error:"Please sign in."},401);
  if (path === "/api/private/logout" && method === "POST") {
    await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256(tokenFrom(request))).run();
    return response({ok:true});
  }
  if (path === "/api/private/matched-search" && method === "POST") {
    const row = await env.DB.prepare("SELECT profile_json FROM personal_profile WHERE id=1").first();
    if (!row) return response({error:"Save your professional profile to the cloud first."},400);
    let profile; try {profile=JSON.parse(row.profile_json)} catch {return response({error:"Stored profile could not be read."},500)}
    if (!profile || !String(profile.roles || profile.cv || profile.experience || "").trim()) return response({error:"Add targeted roles, experience or CV to your cloud profile first."},400);
    return await searchHandler(profile);
  }
  if (path === "/api/private/profile" && method === "GET") {
    const row = await env.DB.prepare("SELECT profile_json,updated_at FROM personal_profile WHERE id=1").first();
    return response({profile:row ? JSON.parse(row.profile_json) : {},updatedAt:row?.updated_at || null});
  }
  if (path === "/api/private/profile" && method === "PUT") {
    const raw = await request.text();
    if (raw.length > 80000) return response({error:"Profile too large"},413);
    let body; try { body=JSON.parse(raw); } catch { return response({error:"Invalid JSON"},400); }
    if (!validProfile(body.profile)) return response({error:"Invalid profile fields"},400);
    await env.DB.prepare("INSERT INTO personal_profile(id,profile_json,updated_at) VALUES(1,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET profile_json=excluded.profile_json,updated_at=CURRENT_TIMESTAMP").bind(JSON.stringify(body.profile)).run();
    return response({ok:true});
  }
  if (path === "/api/private/recruitment/discover" && method === "POST") {
    // Scheduled public-feed discovery, not application authorization.
    const saved=await env.DB.prepare("SELECT profile_json FROM personal_profile WHERE id=1").first();
    if(!saved)return response({error:"Save a cloud profile before enabling discovery"},409);
    let profile;try{profile=JSON.parse(saved.profile_json)}catch{return response({error:"Invalid saved profile"},500)}
    const found=await searchHandler(profile);
    if(!found.ok)return found;
    const data=await found.json();
    const jobs=(data.jobs||[]).slice(0,30);
    let stored=0,skipped=0;
    for(const j of jobs){
      if(!j.title||!j.company||!/^https:\/\//i.test(j.url||"")||!zeroExperienceEvidence(j)){skipped++;continue}
      const channel=routeApplication(j.url);
      const id=crypto.randomUUID();
      const result=await env.DB.prepare("INSERT INTO recruitment_jobs(id,url,title,company,location,work_arrangement,employment_type,salary,match_score,match_reason,language_evidence,eligibility_evidence,verification_status,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(url) DO NOTHING").bind(id,j.url,String(j.title).slice(0,250),String(j.company).slice(0,250),String(j.location||"").slice(0,250),String(j.workArrangement||"").slice(0,80),String(j.employmentType||"").slice(0,80),String(j.salary||"").slice(0,120),Number(j.matchScore)||null,String(j.matchReason||"").slice(0,2500),"Not confirmed — requires employer verification","Not confirmed — requires employer verification","Unverified",String(j.source||channel.channel).slice(0,150)).run();
      if(result.meta?.changes){
        await env.DB.prepare("INSERT INTO recruitment_zero_experience_evidence(job_url,evidence,source_url) VALUES(?,?,?) ON CONFLICT(job_url) DO NOTHING").bind(j.url,String(j.zeroExperienceEvidence).slice(0,1500),String(j.zeroExperienceSourceUrl||j.url).slice(0,1000)).run();
        stored++;
        // Discovery is not proof of eligibility. Surface promising jobs for
        // human verification without granting permission to auto-submit.
        if(Number(j.matchScore)>=85){
          const queueId=crypto.randomUUID();
          await env.DB.prepare("INSERT INTO recruitment_application_queue(id,job_id,status,reason) VALUES(?,?,'Needs review',?) ON CONFLICT(job_id) DO NOTHING").bind(queueId,id,"New vacancy discovered automatically. Verify employer opening, English requirements, Israel eligibility and direct application URL before proceeding.").run();
        }
      }else skipped++;
    }
    let reviewStored=0;
    for(const j of (data.reviewCandidates||[]).slice(0,50)){
      if(!j.title||!j.company||!/^https:\\/\\//i.test(j.url||""))continue;
      const id=crypto.randomUUID();
      const result=await env.DB.prepare("INSERT INTO recruitment_jobs(id,url,title,company,location,work_arrangement,employment_type,salary,match_score,match_reason,language_evidence,eligibility_evidence,verification_status,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(url) DO NOTHING").bind(id,j.url,String(j.title).slice(0,250),String(j.company).slice(0,250),String(j.location||"").slice(0,250),"Unverified","","",Number(j.matchScore)||null,String(j.matchReason||"").slice(0,2500),"Not confirmed","Not confirmed","Unverified",String(j.source||"Public feed").slice(0,150)).run();
      if(result.meta?.changes){
        await env.DB.prepare("INSERT INTO recruitment_application_queue(id,job_id,status,reason) VALUES(?,?,'Needs review',?) ON CONFLICT(job_id) DO NOTHING").bind(crypto.randomUUID(),id,"Discovery only: "+String(j.reviewReason||"Eligibility unknown").slice(0,1000)+". Verify vacancy and employer application URL before applying.").run();
        reviewStored++;
      }
    }
    return response({ok:true,found:jobs.length,stored,skipped,reviewStored,reviewCandidates:(data.reviewCandidates||[]).slice(0,10),diagnostics:data.diagnostics||{},sourceDiagnostics:data.sourceDiagnostics||[],errors:data.errors||[],automaticSubmission:false,verificationRequired:true});
  }
  if (path === "/api/private/recruitment/jobs" && method === "GET") {
    const rows=await env.DB.prepare("SELECT j.*,z.evidence AS zero_experience_evidence,z.source_url AS zero_experience_source_url FROM recruitment_jobs j JOIN recruitment_zero_experience_evidence z ON z.job_url=j.url ORDER BY j.discovered_at DESC LIMIT 500").all();
    return response({jobs:rows.results||[]});
  }
  if (path === "/api/private/recruitment/jobs" && method === "POST") {
    const raw=await request.text();
    if(raw.length>120000)return response({error:"Payload too large"},413);
    let body;try{body=JSON.parse(raw)}catch{return response({error:"Invalid JSON"},400)}
    const jobs=Array.isArray(body.jobs)?body.jobs:[body.job];
    if(!jobs.length||jobs.length>50)return response({error:"Provide 1–50 jobs"},400);
    const clean=(v,n)=>typeof v==="string"?v.trim().slice(0,n):"";
    const records=[];
    for(const job of jobs){
      if(!job||typeof job!=="object")return response({error:"Invalid job"},400);
      let url;try{url=new URL(job.url);if(url.protocol!=="https:")throw Error("https required");url.hash="";for(const key of [...url.searchParams.keys()])if(/^(utm_|fbclid$|gclid$)/i.test(key))url.searchParams.delete(key)}catch{return response({error:"Each job needs a valid HTTPS vacancy URL"},400)}
      const title=clean(job.title,250),company=clean(job.company,250);
      if(!title||!company)return response({error:"Each job needs a title and company"},400);
      if(!zeroExperienceEvidence(job))return response({error:"Every job must include explicit no-experience-required evidence and its HTTPS source URL"},400);
      records.push({zeroEvidence:clean(job.zeroExperienceEvidence,1500),zeroSource:clean(job.zeroExperienceSourceUrl,1000),id:crypto.randomUUID(),url:url.toString(),title,company,location:clean(job.location,250),work:clean(job.workArrangement,80),type:clean(job.employmentType,80),salary:clean(job.salary,120),score:Number.isInteger(job.matchScore)&&job.matchScore>=0&&job.matchScore<=100?job.matchScore:null,reason:clean(job.matchReason,2500),language:clean(job.languageEvidence,1500),eligibility:clean(job.eligibilityEvidence,1500),verification:clean(job.verificationStatus,80)||"Unverified",source:clean(job.source,150)});
    }
    const statements=records.map(j=>env.DB.prepare(`INSERT INTO recruitment_jobs(id,url,title,company,location,work_arrangement,employment_type,salary,match_score,match_reason,language_evidence,eligibility_evidence,verification_status,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET title=excluded.title,company=excluded.company,location=excluded.location,work_arrangement=excluded.work_arrangement,employment_type=excluded.employment_type,salary=excluded.salary,match_score=excluded.match_score,match_reason=excluded.match_reason,language_evidence=excluded.language_evidence,eligibility_evidence=excluded.eligibility_evidence,verification_status=excluded.verification_status,source=excluded.source,last_seen_at=CURRENT_TIMESTAMP`).bind(j.id,j.url,j.title,j.company,j.location,j.work,j.type,j.salary,j.score,j.reason,j.language,j.eligibility,j.verification,j.source));
    await env.DB.batch([...statements,...records.map(j=>env.DB.prepare("INSERT INTO recruitment_zero_experience_evidence(job_url,evidence,source_url) VALUES(?,?,?) ON CONFLICT(job_url) DO UPDATE SET evidence=excluded.evidence,source_url=excluded.source_url,verified_at=CURRENT_TIMESTAMP").bind(j.url,j.zeroEvidence,j.zeroSource))]);
    return response({ok:true,received:records.length});
  }
  if (path === "/api/private/recruitment/application-executor/next" && method === "POST") {
    // Machine-readable candidate discovery only; no applications are submitted here.
    // The browser runner independently checks the vacancy and pauses on unknown fields.
    const rows=await env.DB.prepare("SELECT j.id,j.url,j.title,j.company FROM recruitment_jobs j JOIN recruitment_zero_experience_evidence z ON z.job_url=j.url LEFT JOIN recruitment_application_queue q ON q.job_id=j.id WHERE q.id IS NULL AND j.match_score>=85 AND (j.verification_status LIKE '%Confirmed open%' OR j.verification_status LIKE '%accepting applications%') AND j.language_evidence LIKE '%English%' AND j.language_evidence NOT LIKE '%not confirmed%' AND j.eligibility_evidence IS NOT NULL AND j.eligibility_evidence NOT LIKE '%not confirmed%' ORDER BY j.match_score DESC,j.discovered_at DESC LIMIT 40").all();
    const jobs=(rows.results||[]).filter(j=>!["linkedin","indeed"].includes(routeApplication(j.url).channel));
    return response({jobs,automaticSubmissionAvailable:false,note:"Candidates require independent handoff eligibility and browser checks before submission."});
  }
  if (path === "/api/private/recruitment/application-executor/handoff" && method === "POST") {
    let body;try{body=await request.json()}catch{return response({error:"Invalid JSON"},400)}
    if(typeof body?.jobId!=="string"||body.jobId.length>100)return response({error:"jobId required"},400);
    const job=await env.DB.prepare("SELECT * FROM recruitment_jobs WHERE id=?").bind(body.jobId).first();
    if(!job)return response({error:"Job not found"},404);
    const evidence=await env.DB.prepare("SELECT * FROM recruitment_zero_experience_evidence WHERE job_url=?").bind(job.url).first();
    const policy=await env.DB.prepare("SELECT * FROM recruitment_application_policy WHERE id=1").first();
    const row=await env.DB.prepare("SELECT profile_json FROM personal_profile WHERE id=1").first();
    let profile=null;try{profile=row?JSON.parse(row.profile_json):null}catch{}
    const reasons=(await assessApplication(job,evidence,profile,{...policy,enabled:1})).reasons;
    if(reasons.length)return response({error:"Application handoff blocked",reasons},409);
    const channel=routeApplication(job.url);
    if(channel.channel==="linkedin"||channel.channel==="indeed")return response({error:"Exact employer application URL must be verified first",channel},409);
    const existing=await env.DB.prepare("SELECT status FROM recruitment_application_queue WHERE job_id=?").bind(job.id).first();
    if(existing?.status==="Submitted")return response({error:"Already submitted; duplicate blocked"},409);
    await env.DB.prepare("INSERT INTO recruitment_application_queue(id,job_id,status,reason) VALUES(?,?,'Needs review',?) ON CONFLICT(job_id) DO NOTHING").bind(crypto.randomUUID(),job.id,"Application handoff started; awaiting browser outcome").run();
    return response({jobId:job.id,job:{url:job.url,title:job.title,company:job.company},profile,verifiedZeroExperience:true,verifiedEnglish:true,verifiedIsraelEligibility:true,confirmedOpen:true,sourceEvidence:{zeroExperience:evidence.evidence,sourceUrl:evidence.source_url,language:job.language_evidence,eligibility:job.eligibility_evidence,open:job.verification_status},note:"Private, authenticated handoff. Browser executor must independently check the employer page. No submission occurred."});
  }
  if (path === "/api/private/recruitment/application-executor/receipt" && method === "POST") {
    const raw=await request.text();if(raw.length>12000)return response({error:"Receipt too large"},413);
    let body;try{body=JSON.parse(raw)}catch{return response({error:"Invalid JSON"},400)}
    if(!body||typeof body.jobId!=="string"||typeof body.id!=="string"||!/^[-a-f0-9]{36}$/i.test(body.id)||!["Prepared","Needs review","Submitted"].includes(body.status)||typeof body.jobUrl!=="string")return response({error:"Invalid receipt"},400);
    const job=await env.DB.prepare("SELECT * FROM recruitment_jobs WHERE id=?").bind(body.jobId).first();
    if(!job)return response({error:"Job not found"},404);
    if(body.jobUrl!==job.url)return response({error:"Receipt URL does not match the verified employer vacancy"},409);
    if(["linkedin","indeed"].includes(routeApplication(job.url).channel))return response({error:"Employer-side vacancy URL required"},409);
    const queue=await env.DB.prepare("SELECT * FROM recruitment_application_queue WHERE job_id=?").bind(job.id).first();
    if(!queue)return response({error:"Queue job before uploading receipt"},409);
    if(queue.status==="Submitted")return response({error:"Already submitted; duplicate receipt rejected"},409);
    const confirmation=typeof body.confirmation==="string"?body.confirmation.slice(0,1000):"";
    const confirmationUrl=typeof body.confirmationPage==="string"?body.confirmationPage.slice(0,1000):"";
    if(body.status==="Submitted"&&(!confirmation||!/^https:\/\//.test(confirmationUrl)))return response({error:"Submitted receipt requires employer confirmation text and HTTPS confirmation page"},400);
    const existing=await env.DB.prepare("SELECT id FROM recruitment_application_receipts WHERE id=?").bind(body.id).first();
    if(existing)return response({ok:true,alreadyReceived:true,reviewRequired:true});
    await env.DB.prepare("INSERT INTO recruitment_application_receipts(id,job_id,queue_id,executor_status,confirmation_text,confirmation_url,employer_job_url) VALUES(?,?,?,?,?,?,?)").bind(body.id,job.id,queue.id,body.status,confirmation,confirmationUrl,body.jobUrl).run();
    await env.DB.prepare("INSERT INTO recruitment_application_events(id,queue_id,event_type,details) VALUES(?,?,'Browser receipt received',?)").bind(crypto.randomUUID(),queue.id,"Receipt "+body.id+" pending verification").run();
    if(body.status==="Needs review"||body.status==="Prepared"){
      const reason=typeof body.reason==="string"?body.reason.slice(0,1500):"Browser application requires manual attention";
      await env.DB.prepare("UPDATE recruitment_application_queue SET status='Needs review',reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status!='Submitted'").bind(reason,queue.id).run();
    }
    return response({ok:true,receiptId:body.id,reviewRequired:true,submitted:false},202);
  }
  if (path === "/api/private/recruitment/application-executor/receipts" && method === "GET") {
    const rows=await env.DB.prepare("SELECT r.id,r.job_id,r.executor_status,r.confirmation_text,r.confirmation_url,r.received_at,r.review_status,j.title,j.company FROM recruitment_application_receipts r JOIN recruitment_jobs j ON j.id=r.job_id ORDER BY r.received_at DESC LIMIT 100").all();
    return response({receipts:rows.results||[],note:"Receipts are unverified and do not count as confirmed submissions"});
  }
  // Application automation is deliberately disabled until an authorized submission
  // adapter is installed. A queued item must never be represented as submitted.
  if (path === "/api/private/recruitment/application-executor/run" && method === "POST") {
    let body;try{body=await request.json()}catch{return response({error:"Invalid JSON"},400)}
    if(typeof body?.jobId!=="string"||body.jobId.length>100)return response({error:"jobId required"},400);
    const job=await env.DB.prepare("SELECT * FROM recruitment_jobs WHERE id=?").bind(body.jobId).first();
    if(!job)return response({error:"Job not found"},404);
    const evidence=await env.DB.prepare("SELECT * FROM recruitment_zero_experience_evidence WHERE job_url=?").bind(job.url).first();
    const policy=await env.DB.prepare("SELECT * FROM recruitment_application_policy WHERE id=1").first();
    const row=await env.DB.prepare("SELECT profile_json FROM personal_profile WHERE id=1").first();
    let profile=null;try{profile=row?JSON.parse(row.profile_json):null}catch{}
    const assessment=await assessApplication(job,evidence,profile,policy);
    const executor=assessment.eligible?await executeApplication():{submitted:false,status:"Blocked",reason:assessment.reasons.join("; ")};
    // Never persist 'Submitted' without a verified external reference.
    const id=crypto.randomUUID();
    await env.DB.prepare("INSERT INTO recruitment_application_queue(id,job_id,status,reason) VALUES(?,?,'Blocked',?) ON CONFLICT(job_id) DO UPDATE SET status=CASE WHEN recruitment_application_queue.status='Submitted' THEN 'Submitted' ELSE 'Blocked' END,reason=CASE WHEN recruitment_application_queue.status='Submitted' THEN recruitment_application_queue.reason ELSE excluded.reason END,updated_at=CURRENT_TIMESTAMP").bind(id,job.id,executor.reason).run();
    const record=await env.DB.prepare("SELECT * FROM recruitment_application_queue WHERE job_id=?").bind(job.id).first();
    await env.DB.prepare("INSERT INTO recruitment_application_events(id,queue_id,event_type,details) VALUES(?,?,'Submission blocked',?)").bind(crypto.randomUUID(),record.id,executor.reason).run();
    return response({submitted:false,status:"Blocked",channel:routeApplication(job.url),reasons:assessment.reasons,reason:executor.reason,adapterConfigured:false});
  }
  if (path === "/api/private/recruitment/submitted-applications" && method === "GET") {
    // Only application executor records with an external confirmation may appear here.
    // Manual entries and unsubmitted queue items are intentionally excluded.
    const rows=await env.DB.prepare("SELECT q.id,q.job_id,q.provider,q.external_reference,q.updated_at AS submitted_at,j.title,j.company,j.location,j.url FROM recruitment_application_queue q JOIN recruitment_jobs j ON j.id=q.job_id WHERE q.status='Submitted' AND length(trim(q.external_reference))>0 ORDER BY q.updated_at DESC LIMIT 500").all();
    return response({applications:rows.results||[],verifiedOnly:true});
  }
  if (path === "/api/private/recruitment/application-policy" && method === "GET") {
    const policy=await env.DB.prepare("SELECT * FROM recruitment_application_policy WHERE id=1").first();
    return response({policy,submissionAdapterConfigured:false,automaticSubmissionAvailable:false});
  }
  if (path === "/api/private/recruitment/application-policy" && method === "PUT") {
    let body;try{body=await request.json()}catch{return response({error:"Invalid JSON"},400)}
    if(!body||typeof body!=="object"||body.enabled!==false||!Number.isInteger(body.minMatchScore)||body.minMatchScore<70||body.minMatchScore>100||!Number.isInteger(body.maxDailySubmissions)||body.maxDailySubmissions<1||body.maxDailySubmissions>10)
      return response({error:"Automatic submissions cannot be enabled until a permitted, authenticated application adapter is configured. Set enabled=false."},400);
    await env.DB.prepare("UPDATE recruitment_application_policy SET enabled=0,min_match_score=?,max_daily_submissions=?,updated_at=CURRENT_TIMESTAMP WHERE id=1").bind(body.minMatchScore,body.maxDailySubmissions).run();
    return response({ok:true,enabled:false,submissionAdapterConfigured:false});
  }
  if (path === "/api/private/recruitment/application-queue" && method === "GET") {
    const rows=await env.DB.prepare("SELECT q.*,j.title,j.company,j.url,j.match_score FROM recruitment_application_queue q JOIN recruitment_jobs j ON j.id=q.job_id ORDER BY q.created_at DESC LIMIT 500").all();
    return response({items:(rows.results||[]).map(j=>({...j,channel:routeApplication(j.url)})),automaticSubmissionAvailable:false});
  }
  if (path === "/api/private/recruitment/application-queue" && method === "POST") {
    let body;try{body=await request.json()}catch{return response({error:"Invalid JSON"},400)}
    if(typeof body?.jobId!=="string")return response({error:"jobId required"},400);
    const job=await env.DB.prepare("SELECT * FROM recruitment_jobs WHERE id=?").bind(body.jobId).first();
    if(!job)return response({error:"Job not found"},404);
    const evidence=await env.DB.prepare("SELECT evidence AS zeroExperienceEvidence,source_url AS zeroExperienceSourceUrl FROM recruitment_zero_experience_evidence WHERE job_url=?").bind(job.url).first();
    const reasons=[];
    if(!zeroExperienceEvidence(evidence||{}))reasons.push("No verified zero-experience requirement");
    if(!Number.isInteger(job.match_score)||job.match_score<85)reasons.push("Match score below 85 or missing");
    if(!/confirmed open|accepting applications/i.test(job.verification_status||""))reasons.push("Open application status not confirmed");
    if(!/english/i.test(job.language_evidence||"")||/not confirmed|verify|unclear/i.test(job.language_evidence||""))reasons.push("English-only eligibility not confirmed");
    if(!job.eligibility_evidence||/not confirmed|verify|unclear|potential gap/i.test(job.eligibility_evidence))reasons.push("Eligibility needs review");
    const channel=routeApplication(job.url);
    const reason=reasons.length?reasons.join("; "):"Meets preliminary screening; "+channel.reason;
    const id=crypto.randomUUID();
    await env.DB.prepare("INSERT INTO recruitment_application_queue(id,job_id,status,reason) VALUES(?,?,'Needs review',?) ON CONFLICT(job_id) DO NOTHING").bind(id,job.id,reason).run();
    const record=await env.DB.prepare("SELECT * FROM recruitment_application_queue WHERE job_id=?").bind(job.id).first();
    if(record.id===id)await env.DB.prepare("INSERT INTO recruitment_application_events(id,queue_id,event_type,details) VALUES(?,?,'Queued',?)").bind(crypto.randomUUID(),id,reason).run();
    return response({ok:true,item:record,channel,submitted:false,automaticSubmissionAvailable:false});
  }
  if (path === "/api/private/applications" && method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM applications ORDER BY updated_at DESC LIMIT 1000").all();
    return response({applications:rows.results || []});
  }
  if (path === "/api/private/applications" && method === "POST") {
    let body; try {body=await request.json()}catch{return response({error:"Invalid JSON"},400)}
    const fields=["title","company","platform","status","url","notes"];
    if (!body || typeof body!=="object" || fields.some(k=>typeof body[k]!=="string" || body[k].length>5000) || !body.title.trim() || !body.company.trim() || !statuses.includes(body.status)) return response({error:"Invalid application"},400);
    const id=crypto.randomUUID();
    await env.DB.prepare("INSERT INTO applications(id,title,company,platform,status,url,notes) VALUES(?,?,?,?,?,?,?)").bind(id,...fields.map(k=>body[k])).run();
    return response({ok:true,id},201);
  }
  return response({error:"Not found"},404);
}
