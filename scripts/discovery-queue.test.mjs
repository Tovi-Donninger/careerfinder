// Discovery-key queueing, re-POST updates and dashboard attention items, run against
// a real SQLite database built from migrations/ through a small D1-compatible adapter.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { personalApi, applicationGateReasons, needsAttention } from "../private-api.js";

const DKEY="d".repeat(64),MKEY="e".repeat(64),PKEY="f".repeat(64);
function d1(){
  const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");
  for(const f of readdirSync(new URL("../migrations/",import.meta.url)).sort())db.exec(readFileSync(new URL("../migrations/"+f,import.meta.url),"utf8"));
  const stmt=(sql,args=[])=>({sql,args,bind:(...a)=>stmt(sql,a),run:async()=>{const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}},first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)})});
  return {db,prepare:sql=>stmt(sql),batch:async list=>{db.exec("BEGIN");try{const out=[];for(const s of list)out.push(await s.run());db.exec("COMMIT");return out}catch(e){db.exec("ROLLBACK");throw e}}};
}
const mkEnv=()=>({DB:d1(),ADMIN_PASSWORD_HASH:"100000:x:y",DISCOVERY_WRITE_KEY:DKEY,CAREERFINDER_AUTOMATION_KEY:MKEY,PROFILE_READ_KEY:PKEY});
const call=(env,method,path,headers={},body)=>personalApi(new Request("https://w.example"+path,{method,headers:{"Content-Type":"application/json",...headers},body:body===undefined?undefined:JSON.stringify(body)}),env,new URL("https://w.example"+path));
const save=(env,jobs)=>call(env,"POST","/api/private/recruitment/jobs",{"X-CareerFinder-Discovery-Key":DKEY},{jobs});
const ready={title:"Sales Development Representative",company:"Example",url:"https://careers.example.com/jobs/sdr",location:"Tel Aviv, Israel",roleCategory:"sales",zeroExperienceEvidence:"0-1 years of sales experience",zeroExperienceSourceUrl:"https://careers.example.com/jobs/sdr",matchScore:90,matchReason:"Strong fit",languageEvidence:"English-first role; native English required",eligibilityEvidence:"Israeli citizen; Israel-based role, eligible",verificationStatus:"Confirmed open (employer page checked)"};
const queueRows=env=>env.DB.db.prepare("SELECT q.status,q.provider,q.reason,j.url FROM recruitment_application_queue q JOIN recruitment_jobs j ON j.id=q.job_id").all();
const next=async env=>(await (await call(env,"POST","/api/private/recruitment/application-executor/next",{"X-CareerFinder-Automation-Key":MKEY},{})).json()).jobs;

test("default save holds the job so the pipeline never picks it",async()=>{
  const env=mkEnv();const res=await save(env,[ready]);assert.equal(res.status,200);
  const out=await res.json();assert.deepEqual(out.queue,[{url:ready.url,queue:"held",status:"Needs review"}]);
  assert.equal(queueRows(env)[0].provider,"grok-hold");assert.deepEqual(await next(env),[]);
});
test("queueForApplication:true releases the job to application-executor/next",async()=>{
  const env=mkEnv();const out=await (await save(env,[{...ready,queueForApplication:true}])).json();
  assert.deepEqual(out.queue,[{url:ready.url,queue:"released",status:null}]);
  const picked=await next(env);assert.equal(picked.length,1);assert.equal(picked[0].title,ready.title);
});
test("held job can be released later by re-saving with queueForApplication:true",async()=>{
  const env=mkEnv();await save(env,[ready]);assert.equal(queueRows(env).length,1);
  await save(env,[{...ready,queueForApplication:true}]);assert.equal(queueRows(env).length,0);assert.equal((await next(env)).length,1);
});
test("release never removes a pipeline row or a hold with history",async()=>{
  const env=mkEnv();await save(env,[ready]);
  const q=env.DB.db.prepare("SELECT id FROM recruitment_application_queue").get();
  env.DB.db.prepare("INSERT INTO recruitment_application_events(id,queue_id,event_type) VALUES('e1',?,'x')").run(q.id);
  const out=await (await save(env,[{...ready,queueForApplication:true}])).json();assert.equal(out.queue[0].queue,"held");
  const env2=mkEnv();await save(env2,[{...ready,queueForApplication:true}]);
  const id=env2.DB.db.prepare("SELECT id FROM recruitment_jobs").get().id;
  env2.DB.db.prepare("INSERT INTO recruitment_application_queue(id,job_id,status,reason) VALUES('p1',?,'Submitted','done')").run(id);
  const out2=await (await save(env2,[ready])).json();assert.deepEqual(out2.queue[0],{url:ready.url,queue:"in_queue",status:"Submitted"});
  assert.equal(queueRows(env2)[0].reason,"done");
  await save(env2,[{...ready,queueForApplication:true}]);assert.equal(queueRows(env2)[0].status,"Submitted");
});
test("queueForApplication is rejected (400, nothing written) when a pipeline gate fails",async()=>{
  for(const bad of [{matchScore:80},{verificationStatus:"Unverified"},{languageEvidence:"English — not confirmed"},{eligibilityEvidence:"Remote; unclear"},{location:"Remote",eligibilityEvidence:"Israel citizens welcome"},{url:"https://www.linkedin.com/jobs/view/1"},{verificationStatus:"needs_review"},{matchReason:"NEEDS TOVI: salary question"},{queueForApplication:"yes"}]){
    const env=mkEnv();const res=await save(env,[{queueForApplication:true,...ready,...bad}]);
    assert.equal(res.status,400,JSON.stringify(bad));assert.equal(env.DB.db.prepare("SELECT COUNT(*) n FROM recruitment_jobs").get().n,0);
  }
});
test("experience gate still applies to queued jobs",async()=>{
  const env=mkEnv();assert.equal((await save(env,[{...ready,queueForApplication:true,zeroExperienceEvidence:"2+ years of sales experience"}])).status,400);
});
test("re-POST of an existing URL updates matchReason, verificationStatus and evidence; hold reason follows",async()=>{
  const env=mkEnv();await save(env,[ready]);
  await save(env,[{...ready,matchReason:"NEEDS TOVI: asks about car licence",verificationStatus:"needs_review",zeroExperienceEvidence:"No experience required"}]);
  const job=(await (await call(env,"GET","/api/private/recruitment/jobs",{"X-CareerFinder-Discovery-Key":DKEY})).json()).jobs;
  assert.equal(job.length,1);assert.equal(job[0].match_reason,"NEEDS TOVI: asks about car licence");assert.equal(job[0].verification_status,"needs_review");assert.equal(job[0].zero_experience_evidence,"No experience required");
  assert.equal(queueRows(env)[0].reason,"NEEDS TOVI: asks about car licence");
});
test("handoff block is recorded as a visible queue item and leaves the selector",async()=>{
  const env=mkEnv();await save(env,[{...ready,queueForApplication:true}]);
  const id=(await next(env))[0].id; // no saved profile -> handoff blocked
  const res=await call(env,"POST","/api/private/recruitment/application-executor/handoff",{"X-CareerFinder-Automation-Key":MKEY},{jobId:id});
  assert.equal(res.status,409);assert.match(queueRows(env)[0].reason,/^NEEDS TOVI: Application handoff blocked/);assert.deepEqual(await next(env),[]);
});
test("browser receipts mark the queue item for Tovi",async()=>{
  const env=mkEnv();await save(env,[{...ready,queueForApplication:true}]);
  const id=env.DB.db.prepare("SELECT id FROM recruitment_jobs").get().id;
  env.DB.db.prepare("INSERT INTO recruitment_application_queue(id,job_id,status,reason) VALUES('q1',?,'Needs review','Application handoff started; awaiting browser outcome')").run(id);
  const rc=(status,extra={})=>call(env,"POST","/api/private/recruitment/application-executor/receipt",{"X-CareerFinder-Automation-Key":MKEY},{jobId:id,id:crypto.randomUUID(),jobUrl:ready.url,status,...extra});
  assert.equal((await rc("Needs review",{reason:"Required questions need review: salary"})).status,202);
  assert.equal(queueRows(env)[0].reason,"NEEDS TOVI: Application held by the browser run: Required questions need review: salary");
  assert.equal((await rc("Submitted",{confirmation:"Thank you for applying",confirmationPage:"https://careers.example.com/thanks"})).status,202);
  assert.match(queueRows(env)[0].reason,/^NEEDS TOVI: Browser run reports the application was submitted\. Employer confirmation: "Thank you for applying"/);
  assert.equal(queueRows(env)[0].status,"Needs review");
});
test("discovery key stays scoped: 401 on every other route",async()=>{
  const env=mkEnv();
  for(const [m,p] of [["GET","/api/private/profile"],["PUT","/api/private/profile"],["POST","/api/private/recruitment/application-executor/next"],["POST","/api/private/recruitment/application-executor/handoff"],["POST","/api/private/recruitment/application-executor/receipt"],["GET","/api/private/recruitment/application-executor/receipts"],["POST","/api/private/recruitment/application-executor/run"],["POST","/api/private/recruitment/discover"],["POST","/api/private/recruitment/verify-queue"],["GET","/api/private/recruitment/application-queue"],["POST","/api/private/recruitment/application-queue"],["GET","/api/private/recruitment/submitted-applications"],["GET","/api/private/recruitment/application-policy"],["PUT","/api/private/recruitment/application-policy"],["GET","/api/private/applications"],["POST","/api/private/applications"],["POST","/api/private/matched-search"],["POST","/api/private/logout"],["PUT","/api/private/recruitment/jobs"],["DELETE","/api/private/recruitment/jobs"]])
    assert.equal((await call(env,m,p,{"X-CareerFinder-Discovery-Key":DKEY},m==="GET"?undefined:{})).status,401,m+" "+p);
  assert.equal((await call(env,"GET","/api/private/recruitment/jobs",{"X-CareerFinder-Discovery-Key":"0".repeat(64)})).status,401);
  assert.equal((await save({...env,DISCOVERY_WRITE_KEY:undefined},[ready])).status,401);
});
test("verify-queue skips Grok holds so Tovi's note is not overwritten",()=>{
  const src=readFileSync(new URL("../private-api.js",import.meta.url),"utf8");
  assert.match(src,/WHERE q\.status='Needs review' AND q\.provider!='grok-hold'/);
});
test("helpers",()=>{
  assert.equal(needsAttention({verificationStatus:"needs_review"}),true);assert.equal(needsAttention({matchReason:"NEEDS TOVI: x"}),true);assert.equal(needsAttention({matchReason:"fine"}),false);
  assert.deepEqual(applicationGateReasons({score:90,verification:"Confirmed open",language:"English",eligibility:"Israel eligible",location:"Tel Aviv",url:"https://e.com/j",reason:"ok"}),[]);
});
