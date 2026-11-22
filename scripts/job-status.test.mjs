// Tovi's own Applied / Rejected tracking (owner session only), undo, and the effect on the automation.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { personalApi, jobStatusInput } from "../private-api.js";

const DKEY="d".repeat(64),MKEY="e".repeat(64),TOKEN="a1".repeat(32);
function d1(){
  const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");
  for(const f of readdirSync(new URL("../migrations/",import.meta.url)).sort())db.exec(readFileSync(new URL("../migrations/"+f,import.meta.url),"utf8"));
  const stmt=(sql,args=[])=>({sql,args,bind:(...a)=>stmt(sql,a),run:async()=>{const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}},first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)})});
  return {db,prepare:sql=>stmt(sql),batch:async list=>{db.exec("BEGIN");try{const out=[];for(const s of list)out.push(await s.run());db.exec("COMMIT");return out}catch(e){db.exec("ROLLBACK");throw e}}};
}
const ready={title:"Sales Development Representative",company:"Example",url:"https://careers.example.com/jobs/sdr",location:"Tel Aviv, Israel",roleCategory:"sales",zeroExperienceEvidence:"0-1 years of sales experience",zeroExperienceSourceUrl:"https://careers.example.com/jobs/sdr",matchScore:90,matchReason:"Strong fit",languageEvidence:"English-first role; native English required",eligibilityEvidence:"Israeli citizen; Israel-based role, eligible",verificationStatus:"Confirmed open (employer page checked)"};
async function setup(job=ready,queue=false){
  const env={DB:d1(),ADMIN_PASSWORD_HASH:"100000:x:y",DISCOVERY_WRITE_KEY:DKEY,CAREERFINDER_AUTOMATION_KEY:MKEY};
  env.DB.db.prepare("INSERT INTO auth_sessions(token_hash,expires_at) VALUES(?,datetime('now','+1 hour'))").run(createHash("sha256").update(TOKEN).digest("hex"));
  const call=(method,path,body,headers={})=>personalApi(new Request("https://w.example"+path,{method,headers:{"Content-Type":"application/json",...headers},body:body===undefined?undefined:JSON.stringify(body)}),env,new URL("https://w.example"+path));
  const owner=(method,path,body)=>call(method,path,body,{Authorization:"Bearer "+TOKEN});
  const dk=(method,path,body)=>call(method,path,body,{"X-CareerFinder-Discovery-Key":DKEY});
  const mk=(method,path,body)=>call(method,path,body,{"X-CareerFinder-Automation-Key":MKEY});
  assert.equal((await dk("POST","/api/private/recruitment/jobs",{jobs:[{...job,queueForApplication:queue}]})).status,200);
  const id=env.DB.db.prepare("SELECT id FROM recruitment_jobs WHERE url=?").get(job.url).id;
  const row=()=>env.DB.db.prepare("SELECT q.status,q.provider,q.reason,q.external_reference,j.pipeline FROM recruitment_application_queue q JOIN recruitment_jobs j ON j.id=q.job_id WHERE j.id=?").get(id)??null;
  const set=(status,extra={})=>owner("POST","/api/private/recruitment/job-status",{jobId:id,status,...extra});
  const nextJobs=async()=>(await (await mk("POST","/api/private/recruitment/application-executor/next",{})).json()).jobs;
  return {env,id,row,set,owner,dk,mk,call,nextJobs};
}

test("input validation",()=>{
  assert.deepEqual(jobStatusInput({jobId:"x",status:"Applied",note:" a  b "}),{jobId:"x",status:"Applied",note:"a b"});
  for(const b of [null,{},{jobId:"x"},{jobId:"x",status:"Submitted"},{jobId:"x",status:"applied"},{jobId:"",status:"Applied"},{status:"Applied"}])assert.ok(jobStatusInput(b).error,JSON.stringify(b));
});
test("route needs the owner session: no auth and every machine key are refused, nothing changes",async()=>{
  const {id,call,dk,mk,row}=await setup();
  const body={jobId:id,status:"Applied"};
  assert.equal((await call("POST","/api/private/recruitment/job-status",body)).status,401);
  assert.equal((await call("POST","/api/private/recruitment/job-status",body,{Authorization:"Bearer "+"b2".repeat(32)})).status,401);
  assert.equal((await dk("POST","/api/private/recruitment/job-status",body)).status,401);
  assert.equal((await mk("POST","/api/private/recruitment/job-status",body)).status,401);
  assert.equal(row().status,"Needs review");
});
test("owner marks a held job Applied: manual provider, pipeline updated, reason (AI note) kept, shown in both readbacks",async()=>{
  const {id,row,set,owner}=await setup();
  const res=await set("Applied",{note:"applied on company site"});
  assert.equal(res.status,200);const out=await res.json();
  assert.equal(out.status,"Applied");assert.equal(out.manual,true);
  const r=row();assert.equal(r.status,"Applied");assert.equal(r.provider,"tovi-manual");assert.equal(r.pipeline,"Applied");assert.equal(r.external_reference,"");assert.match(r.reason,/Strong fit/);
  const jobs=(await (await owner("GET","/api/private/recruitment/jobs")).json()).jobs;
  assert.equal(jobs[0].queue_status,"Applied");assert.equal(jobs[0].queue_provider,"tovi-manual");assert.equal(jobs[0].id,id);
  const q=(await (await owner("GET","/api/private/recruitment/application-queue")).json()).items;
  assert.equal(q[0].status,"Applied");assert.equal(q[0].job_id,id);
  // A manual Applied is NOT a confirmed submission.
  assert.deepEqual((await (await owner("GET","/api/private/recruitment/submitted-applications")).json()).applications,[]);
});
test("a released job (no queue row) is taken out of the auto-apply selector when marked Applied or Rejected, and Undo puts it back",async()=>{
  for(const status of ["Applied","Rejected"]){
    const {row,set,nextJobs}=await setup(ready,true);
    assert.equal(row(),null);assert.equal((await nextJobs()).length,1);
    assert.equal((await set(status)).status,200);
    assert.equal(row().status,status);assert.deepEqual(await nextJobs(),[]);
    const undo=await (await set("Reset")).json();
    assert.equal(undo.restored,true);assert.equal(undo.status,null);
    assert.equal(row(),null);assert.equal((await nextJobs()).length,1);
  }
});
test("rediscovery, re-save and release never overwrite or re-queue an Applied or Rejected job",async()=>{
  const {row,set,dk}=await setup();
  await set("Rejected");
  for(const queueForApplication of [false,true]){
    assert.equal((await dk("POST","/api/private/recruitment/jobs",{jobs:[{...ready,queueForApplication,matchReason:queueForApplication?"Strong fit":"NEEDS TOVI: again"}]})).status,200);
    assert.equal(row().status,"Rejected");assert.equal(row().provider,"tovi-manual");
  }
});
test("applier routes refuse to touch an Applied or Rejected job (handoff, receipt, run)",async()=>{
  const {env,id,row,set,mk,owner}=await setup();
  await set("Applied");
  const handoff=await mk("POST","/api/private/recruitment/application-executor/handoff",{jobId:id});
  assert.equal(handoff.status,409);
  const url=ready.url;
  const receipt=await mk("POST","/api/private/recruitment/application-executor/receipt",{jobId:id,id:"00000000-0000-4000-8000-000000000001",status:"Needs review",jobUrl:url,reason:"x"});
  assert.equal(receipt.status,409);
  const run=await owner("POST","/api/private/recruitment/application-executor/run",{jobId:id});
  assert.equal(run.status,409);
  assert.equal(row().status,"Applied");
  assert.equal(env.DB.db.prepare("SELECT count(*) n FROM recruitment_application_receipts").get().n,0);
});
test("Applied -> Rejected -> Undo -> Undo walks back through each earlier state; idempotent repeats change nothing",async()=>{
  const {row,set,env}=await setup();
  await set("Applied");
  assert.equal((await (await set("Applied")).json()).unchanged,true);
  await set("Rejected");assert.equal(row().status,"Rejected");assert.equal(row().pipeline,"Rejected");
  await set("Reset");assert.equal(row().status,"Applied");assert.equal(row().pipeline,"Applied");
  await set("Reset");const r=row();assert.equal(r.status,"Needs review");assert.equal(r.provider,"grok-hold");assert.equal(r.pipeline,"Discovered");
  assert.equal((await set("Reset")).status,409);
  assert.equal(env.DB.db.prepare("SELECT count(*) n FROM recruitment_application_events WHERE event_type='Manual status set'").get().n,0);
});
test("AI-confirmed Submitted stays Submitted when marked Applied; Rejected keeps the confirmation; Undo returns to Submitted",async()=>{
  const {id,env,row,set,owner}=await setup();
  env.DB.db.prepare("UPDATE recruitment_application_queue SET status='Submitted',provider='browser-runner',external_reference='browser-receipt:1 https://x.example/thanks' WHERE job_id=?").run(id);
  const same=await (await set("Applied")).json();assert.equal(same.unchanged,true);assert.equal(same.status,"Submitted");assert.equal(row().provider,"browser-runner");
  assert.equal((await set("Rejected")).status,200);
  let r=row();assert.equal(r.status,"Rejected");assert.equal(r.provider,"browser-runner");assert.equal(r.external_reference,"browser-receipt:1 https://x.example/thanks");
  const sub=(await (await owner("GET","/api/private/recruitment/submitted-applications")).json()).applications;
  assert.equal(sub.length,1);assert.equal(sub[0].status,"Rejected");
  assert.equal((await set("Applied")).status,409);
  await set("Reset");r=row();assert.equal(r.status,"Submitted");assert.equal(r.provider,"browser-runner");assert.equal(r.pipeline,"Discovered");
});
test("unknown job, bad status and bad JSON are rejected",async()=>{
  const {owner,id}=await setup();
  assert.equal((await owner("POST","/api/private/recruitment/job-status",{jobId:"nope",status:"Applied"})).status,404);
  assert.equal((await owner("POST","/api/private/recruitment/job-status",{jobId:id,status:"Submitted"})).status,400);
  assert.equal((await owner("POST","/api/private/recruitment/job-status",{jobId:id,status:"Reset"})).status,409);
});
test("a LinkedIn confirmation does not overwrite a Rejected mark",async()=>{
  const LI="https://www.linkedin.com/jobs/view/4491387430";
  const {row,set,dk}=await setup({...ready,url:LI,matchReason:"NEEDS TOVI: LinkedIn-only",verificationStatus:"needs_review"});
  await set("Rejected");
  const res=await (await dk("POST","/api/private/recruitment/external-application",{url:LI,confirmation:"Application submitted"})).json();
  assert.equal(res.alreadyTracked,true);assert.equal(row().status,"Rejected");assert.equal(row().external_reference,"");
});
test("a later confirmation upgrades a tovi-manual Applied mark to Submitted",async()=>{
  const LI="https://www.linkedin.com/jobs/view/4491387430";
  const {row,set,dk}=await setup({...ready,url:LI,matchReason:"NEEDS TOVI: LinkedIn-only",verificationStatus:"needs_review"});
  await set("Applied");
  assert.equal(row().status,"Applied");assert.equal(row().provider,"tovi-manual");
  const res=await dk("POST","/api/private/recruitment/external-application",{url:LI,confirmation:"Your application was sent",provider:"linkedin-easy-apply",appliedAt:"2026-11-22 10:56"});
  assert.equal(res.status,200);
  const body=await res.json();
  assert.equal(body.status,"Submitted");assert.equal(body.provider,"linkedin-easy-apply");assert.equal(body.alreadyTracked,undefined);
  const r=row();assert.equal(r.status,"Submitted");assert.equal(r.provider,"linkedin-easy-apply");assert.equal(r.pipeline,"Submitted");
  assert.match(r.external_reference,/^linkedin:4491387430 Your application was sent/);
});
test("tracked-jobs list: only Applied/Rejected, owner session only, leaves the list on Undo",async()=>{
  const {id,set,owner,call,mk,dk}=await setup();
  const list=async()=>(await (await owner("GET","/api/private/recruitment/tracked-jobs")).json());
  assert.deepEqual((await list()).jobs,[]);
  await set("Applied",{note:"x"});
  let out=await list();
  assert.equal(out.applied,1);assert.equal(out.rejected,0);
  assert.equal(out.jobs[0].id,id);assert.equal(out.jobs[0].status,"Applied");assert.equal(out.jobs[0].title,ready.title);assert.equal(out.jobs[0].url,ready.url);assert.match(out.jobs[0].marked_at,/^\d{4}-\d\d-\d\d/);assert.equal(out.jobs[0].was_submitted,false);
  await set("Rejected");out=await list();assert.equal(out.applied,0);assert.equal(out.rejected,1);
  await set("Reset");await set("Reset");assert.deepEqual((await list()).jobs,[]);
  for(const f of [()=>call("GET","/api/private/recruitment/tracked-jobs"),()=>dk("GET","/api/private/recruitment/tracked-jobs"),()=>mk("GET","/api/private/recruitment/tracked-jobs")])assert.equal((await f()).status,401);
});
