// Browser receipts with employer confirmation become Confirmed submissions (status Submitted
// plus external_reference); everything else stays held for Tovi.
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { personalApi, confirmationOnEmployerSite } from "../private-api.js";
const DKEY="d".repeat(64),MKEY="e".repeat(64);
function d1(){
  const db=new DatabaseSync(":memory:");db.exec("PRAGMA foreign_keys=ON");
  for(const f of readdirSync(new URL("../migrations/",import.meta.url)).sort())db.exec(readFileSync(new URL("../migrations/"+f,import.meta.url),"utf8"));
  const stmt=(sql,args=[])=>({sql,args,bind:(...a)=>stmt(sql,a),run:async()=>{const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}},first:async()=>db.prepare(sql).get(...args)??null,all:async()=>({results:db.prepare(sql).all(...args)})});
  return {db,prepare:sql=>stmt(sql),batch:async list=>{for(const s of list)await s.run()}};
}
const URL_AK="https://www.comeet.com/jobs/akeyless/27.006/business-development-representative-bdr--international/5F.07D";
const job={title:"Business Development Representative (BDR) – International",company:"Akeyless",url:URL_AK,location:"Ramat Gan, Israel",roleCategory:"sales",zeroExperienceEvidence:"Experience level: Entry-level. Prior SDR experience is an asset but is not required.",zeroExperienceSourceUrl:URL_AK,matchScore:90,matchReason:"Fit",languageEvidence:"Native English",eligibilityEvidence:"Israeli citizen; Israel-based role, eligible",verificationStatus:"Confirmed open",queueForApplication:true};
async function setup(){
  const env={DB:d1(),ADMIN_PASSWORD_HASH:"100000:x:y",DISCOVERY_WRITE_KEY:DKEY,CAREERFINDER_AUTOMATION_KEY:MKEY};
  const call=(method,path,headers={},body)=>personalApi(new Request("https://w.example"+path,{method,headers:{"Content-Type":"application/json",...headers},body:body===undefined?undefined:JSON.stringify(body)}),env,new URL("https://w.example"+path));
  assert.equal((await call("POST","/api/private/recruitment/jobs",{"X-CareerFinder-Discovery-Key":DKEY},{jobs:[job]})).status,200);
  const j=env.DB.db.prepare("SELECT id FROM recruitment_jobs WHERE url=?").get(URL_AK);
  env.DB.db.prepare("INSERT INTO recruitment_application_queue(id,job_id,status,reason) VALUES('q1',?,'Needs review','Application handoff started; awaiting browser outcome')").run(j.id);
  const receipt=body=>call("POST","/api/private/recruitment/application-executor/receipt",{"X-CareerFinder-Automation-Key":MKEY},{jobId:j.id,jobUrl:URL_AK,...body});
  const row=()=>env.DB.db.prepare("SELECT status,provider,external_reference,reason FROM recruitment_application_queue WHERE id='q1'").get();
  return {env,receipt,row};
}
const rid=n=>"00000000-0000-4000-8000-00000000000"+n;
test("confirmed receipt is recorded as Submitted with an external reference",async()=>{
  const {receipt,row}=await setup();
  const res=await receipt({id:rid(1),status:"Submitted",confirmation:"Your application has been submitted",confirmationPage:URL_AK});
  assert.equal(res.status,202);const out=await res.json();assert.equal(out.submitted,true);
  const r=row();assert.equal(r.status,"Submitted");assert.equal(r.provider,"browser-runner");assert.match(r.external_reference,/^browser-receipt:00000000-.* https:\/\/www\.comeet\.com\//);
  const dup=await receipt({id:rid(2),status:"Submitted",confirmation:"Your application has been submitted",confirmationPage:URL_AK});
  assert.equal(dup.status,409);
});
test("confirmation on an unrelated host stays held for Tovi",async()=>{
  const {receipt,row}=await setup();
  await receipt({id:rid(3),status:"Submitted",confirmation:"Thank you for applying",confirmationPage:"https://evil.example/thanks"});
  const r=row();assert.notEqual(r.status,"Submitted");assert.equal(r.external_reference,"");assert.match(r.reason,/^NEEDS TOVI:/);
});
test("submitted receipt without confirmation text or https page is rejected",async()=>{
  const {receipt,row}=await setup();
  assert.equal((await receipt({id:rid(4),status:"Submitted",confirmation:"",confirmationPage:URL_AK})).status,400);
  assert.equal((await receipt({id:rid(5),status:"Submitted",confirmation:"Thank you for applying",confirmationPage:"http://www.comeet.com/x"})).status,400);
  assert.equal(row().status,"Needs review");
});
test("held receipt keeps the NEEDS TOVI reason",async()=>{
  const {receipt,row}=await setup();
  await receipt({id:rid(6),status:"Needs review",reason:"Required questions need review: Why Akeyless?"});
  assert.match(row().reason,/^NEEDS TOVI: Application held by the browser run: Required questions/);
});
test("confirmation host rule",()=>{
  assert.equal(confirmationOnEmployerSite("https://www.comeet.co/jobs/27.006/5F.07D/apply",URL_AK),true);
  assert.equal(confirmationOnEmployerSite("https://job-boards.greenhouse.io/x/jobs/1/confirmation","https://careers.myheritage.com/jobs/8399105?gh_jid=8399105"),true);
  assert.equal(confirmationOnEmployerSite("https://other.example/x",URL_AK),false);
});
