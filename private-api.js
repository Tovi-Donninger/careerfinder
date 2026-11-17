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
  if (!(await authorized(request, env.DB))) return response({error:"Please sign in."},401);
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
  if (path === "/api/private/recruitment/jobs" && method === "GET") {
    const rows=await env.DB.prepare("SELECT * FROM recruitment_jobs ORDER BY discovered_at DESC LIMIT 500").all();
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
      records.push({id:crypto.randomUUID(),url:url.toString(),title,company,location:clean(job.location,250),work:clean(job.workArrangement,80),type:clean(job.employmentType,80),salary:clean(job.salary,120),score:Number.isInteger(job.matchScore)&&job.matchScore>=0&&job.matchScore<=100?job.matchScore:null,reason:clean(job.matchReason,2500),language:clean(job.languageEvidence,1500),eligibility:clean(job.eligibilityEvidence,1500),verification:clean(job.verificationStatus,80)||"Unverified",source:clean(job.source,150)});
    }
    const statements=records.map(j=>env.DB.prepare(`INSERT INTO recruitment_jobs(id,url,title,company,location,work_arrangement,employment_type,salary,match_score,match_reason,language_evidence,eligibility_evidence,verification_status,source) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET title=excluded.title,company=excluded.company,location=excluded.location,work_arrangement=excluded.work_arrangement,employment_type=excluded.employment_type,salary=excluded.salary,match_score=excluded.match_score,match_reason=excluded.match_reason,language_evidence=excluded.language_evidence,eligibility_evidence=excluded.eligibility_evidence,verification_status=excluded.verification_status,source=excluded.source,last_seen_at=CURRENT_TIMESTAMP`).bind(j.id,j.url,j.title,j.company,j.location,j.work,j.type,j.salary,j.score,j.reason,j.language,j.eligibility,j.verification,j.source));
    await env.DB.batch(statements);
    return response({ok:true,received:records.length});
  }
  // Application automation is deliberately disabled until an authorized submission
  // adapter is installed. A queued item must never be represented as submitted.
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
    return response({items:rows.results||[],automaticSubmissionAvailable:false});
  }
  if (path === "/api/private/recruitment/application-queue" && method === "POST") {
    let body;try{body=await request.json()}catch{return response({error:"Invalid JSON"},400)}
    if(typeof body?.jobId!=="string")return response({error:"jobId required"},400);
    const job=await env.DB.prepare("SELECT * FROM recruitment_jobs WHERE id=?").bind(body.jobId).first();
    if(!job)return response({error:"Job not found"},404);
    const reasons=[];
    if(!Number.isInteger(job.match_score)||job.match_score<85)reasons.push("Match score below 85 or missing");
    if(!/confirmed open|accepting applications/i.test(job.verification_status||""))reasons.push("Open application status not confirmed");
    if(!/english/i.test(job.language_evidence||"")||/not confirmed|verify|unclear/i.test(job.language_evidence||""))reasons.push("English-only eligibility not confirmed");
    if(!job.eligibility_evidence||/not confirmed|verify|unclear|potential gap/i.test(job.eligibility_evidence))reasons.push("Eligibility needs review");
    const reason=reasons.length?reasons.join("; "):"Meets preliminary screening; permitted submission integration still required";
    const id=crypto.randomUUID();
    await env.DB.prepare("INSERT INTO recruitment_application_queue(id,job_id,status,reason) VALUES(?,?,'Needs review',?) ON CONFLICT(job_id) DO NOTHING").bind(id,job.id,reason).run();
    const record=await env.DB.prepare("SELECT * FROM recruitment_application_queue WHERE job_id=?").bind(job.id).first();
    if(record.id===id)await env.DB.prepare("INSERT INTO recruitment_application_events(id,queue_id,event_type,details) VALUES(?,?,'Queued',?)").bind(crypto.randomUUID(),id,reason).run();
    return response({ok:true,item:record,submitted:false,automaticSubmissionAvailable:false});
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
