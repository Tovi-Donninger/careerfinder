// Discovery key may record an application already confirmed on LinkedIn for an existing discovery.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { personalApi, externalApplicationInput } from "../private-api.js";
const DKEY="d".repeat(64),MKEY="e".repeat(64);
function d1(){
  const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");
  for(const f of readdirSync(new URL("../migrations/",import.meta.url)).sort())db.exec(readFileSync(new URL("../migrations/"+f,import.meta.url),"utf8"));
  const stmt=(sql,args=[])=>({sql,args,bind:(...a)=>stmt(sql,a),run:async()=>{const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}},first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)})});
  return {db,prepare:sql=>stmt(sql),batch:async list=>{for(const s of list)await s.run()}};
}
const LI="https://www.linkedin.com/jobs/view/4491387430";
const job={title:"Full-cycle B2C Sales Closer",company:"Global Dev Experts",url:LI,location:"Ramat Gan, Israel",roleCategory:"sales",zeroExperienceEvidence:"B2C phone sales experience (no number of years stated)",zeroExperienceSourceUrl:LI,matchScore:82,matchReason:"NEEDS TOVI: LinkedIn-only",languageEvidence:"English",eligibilityEvidence:"Israel",verificationStatus:"needs_review"};
async function setup(){
  const env={DB:d1(),ADMIN_PASSWORD_HASH:"100000:x:y",DISCOVERY_WRITE_KEY:DKEY,CAREERFINDER_AUTOMATION_KEY:MKEY};
  const call=(method,path,body,key=DKEY)=>personalApi(new Request("https://w.example"+path,{method,headers:{"Content-Type":"application/json","X-CareerFinder-Discovery-Key":key},body:body===undefined?undefined:JSON.stringify(body)}),env,new URL("https://w.example"+path));
  assert.equal((await call("POST","/api/private/recruitment/jobs",{jobs:[job]})).status,200);
  const row=()=>env.DB.db.prepare("SELECT q.status,q.provider,q.external_reference,q.reason,j.pipeline FROM recruitment_application_queue q JOIN recruitment_jobs j ON j.id=q.job_id WHERE j.url=?").get(LI);
  const record=b=>call("POST","/api/private/recruitment/external-application",b);
  return {env,call,row,record};
}
test("records a confirmed LinkedIn application as Submitted (Confirmed submissions query)",async()=>{
  const {env,row,record,call}=await setup();
  assert.equal(row().provider,"grok-hold");
  const res=await record({url:LI,confirmation:"Application status – Application submitted – now",provider:"linkedin-easy-apply",appliedAt:"2026-11-19",cv:"Israeli style CV 10_04_2026.docx"});
  assert.equal(res.status,200);
  const r=row();assert.equal(r.status,"Submitted");assert.equal(r.provider,"linkedin-easy-apply");assert.equal(r.pipeline,"Submitted");
  assert.equal(r.external_reference,"linkedin:4491387430 Application status – Application submitted – now");
  assert.match(r.reason,/^APPLIED via LinkedIn 2026-11-19/);
  assert.equal(env.DB.db.prepare("SELECT count(*) n FROM recruitment_application_queue WHERE status='Submitted' AND length(trim(external_reference))>0").get().n,1);
  // A later discovery re-POST never touches the submitted row.
  await call("POST","/api/private/recruitment/jobs",{jobs:[{...job,matchReason:"APPLIED via LinkedIn 2026-11-19: done",verificationStatus:"Applied via LinkedIn"}]});
  assert.equal(row().status,"Submitted");assert.equal(row().provider,"linkedin-easy-apply");
  // Idempotent: second record keeps the first reference.
  const again=await (await record({url:LI,confirmation:"other",provider:"manual"})).json();
  assert.equal(again.alreadySubmitted,true);assert.equal(row().external_reference,"linkedin:4491387430 Application status – Application submitted – now");
  // GET readback shows queue status.
  const list=await (await call("GET","/api/private/recruitment/jobs")).json();
  assert.equal(list.jobs[0].queue_status,"Submitted");assert.equal(list.jobs[0].queue_provider,"linkedin-easy-apply");
});
test("manual provider works and unknown jobs are refused",async()=>{
  const {record,row}=await setup();
  assert.equal((await record({url:"https://www.linkedin.com/jobs/view/4482066043",confirmation:"Application submitted · 2 weeks ago",provider:"manual"})).status,404);
  assert.equal((await record({url:LI+"/",confirmation:"Application submitted · 2 weeks ago",provider:"manual"})).status,200);
  assert.equal(row().provider,"manual");
});
test("input validation: LinkedIn job-view URL, confirmation text, provider",async()=>{
  const {record,row}=await setup();
  for(const b of [{url:"https://careers.example.com/jobs/1",confirmation:"x"},{url:"http://www.linkedin.com/jobs/view/4491387430",confirmation:"x"},{url:"https://www.linkedin.com/jobs/search?id=4491387430",confirmation:"x"},{url:"https://evil.com/www.linkedin.com/jobs/view/4491387430",confirmation:"x"},{url:LI,confirmation:"   "},{url:LI},{url:LI,confirmation:"x",provider:"browser-runner"},{url:LI,confirmation:"x",status:"Rejected",provider:"other"}])
    assert.equal((await record(b)).status,400,JSON.stringify(b));
  assert.equal(row().status,"Needs review");
  assert.deepEqual(externalApplicationInput({url:"https://linkedin.com/jobs/view/123456",confirmation:" a  b "}),{url:"https://www.linkedin.com/jobs/view/123456",linkedinJobId:"123456",confirmation:"a b",provider:"linkedin-easy-apply",appliedAt:"",cv:""});
});
test("route needs the discovery key and the discovery key stays scoped",async()=>{
  const {call}=await setup();
  assert.equal((await call("POST","/api/private/recruitment/external-application",{url:LI,confirmation:"x"},"a".repeat(64))).status,401);
  assert.equal((await call("POST","/api/private/recruitment/application-executor/receipt",{})).status,401);
  assert.equal((await call("GET","/api/private/recruitment/submitted-applications")).status,401);
});
