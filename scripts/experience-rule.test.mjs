import test from "node:test";
import assert from "node:assert/strict";
import { experienceEvidence, zeroExperienceEvidence, encodeStoredEvidence, decodeStoredEvidence, storedExperienceEvidence, pageExperienceOk } from "../zero-experience.js";
import { personalApi } from "../private-api.js";
import { inspectVacancy } from "./vacancy-verification.mjs";

const src="https://example.com/jobs/1";
const job=(roleCategory,text,url=src)=>({roleCategory,zeroExperienceEvidence:text,zeroExperienceSourceUrl:url});

test("HR with '1 year' rejected",()=>assert.equal(experienceEvidence(job("hr_recruitment","Requires 1 year of experience in recruiting")),false));
test("HR with 'no experience required' accepted",()=>assert.equal(experienceEvidence(job("hr_recruitment","No experience required, training provided")),true));
test("sales with '0-1 years' accepted",()=>assert.equal(experienceEvidence(job("sales","0-1 years of sales experience")),true));
test("admin_ops with '1+ years of experience' accepted",()=>assert.equal(experienceEvidence(job("admin_ops","1+ years of experience in office administration")),true));
test("customer_success with '1-2 years' rejected",()=>assert.equal(experienceEvidence(job("customer_success","1-2 years of experience in customer success")),false));
test("sales with '2 years' rejected",()=>assert.equal(experienceEvidence(job("sales","2 years of sales experience")),false));
test("missing category with '1 year' rejected",()=>assert.equal(experienceEvidence(job(undefined,"1 year of experience")),false));
test("missing source URL rejected",()=>{assert.equal(experienceEvidence(job("sales","0-1 years of experience","")),false);assert.equal(experienceEvidence(job("sales","0-1 years of experience","http://example.com/x")),false)});
test("unknown category rejected",()=>assert.equal(experienceEvidence(job("marketing","0-1 years of experience")),false));
test("missing category keeps legacy zero-experience behaviour",()=>{assert.equal(experienceEvidence(job(undefined,"No experience required")),true);assert.equal(experienceEvidence(job(undefined,"No experience required")),zeroExperienceEvidence(job(undefined,"No experience required")))});
test("accepted phrasings up to 1 year",()=>{for(const t of ["up to 1 year of experience","at least one year of experience","6 months of relevant experience","entry level, 1 year of experience","no experience required","at least a year of experience","minimum 1 year experience"])assert.equal(experienceEvidence(job("sales",t)),true,t)});
test("rejected phrasings above 1 year",()=>{for(const t of ["minimum two years of experience","1-3 years of experience","2+ years of experience","18 months of experience","1.5 years experience","several years of experience","over a year of experience","2+ years of experience required"])assert.equal(experienceEvidence(job("customer_success",t)),false,t)});
test("preferred years above 1 are accepted when there is no hard requirement (Tovi, 2026-11-22)",()=>{for(const t of ["no experience required but 3 years preferred","at least 1 year, ideally 3-5 years experience","2+ years of experience preferred","Experience is an advantage","Experience preferred","Nice to have: previous experience"])assert.equal(experienceEvidence(job("customer_success",t)),true,t)});
test("evidence without any experience statement rejected",()=>assert.equal(experienceEvidence(job("sales","Exciting role in a growing team")),false));

test("stored evidence round trip keeps category and gate",()=>{
  const j=job("sales","0-1 years of experience");const stored=encodeStoredEvidence(j);
  assert.match(stored,/^\[role:sales\] /);
  assert.deepEqual(decodeStoredEvidence(stored),{roleCategory:"sales",evidence:"0-1 years of experience"});
  assert.equal(storedExperienceEvidence({evidence:stored,source_url:src}),true);
  assert.equal(storedExperienceEvidence({evidence:"0-1 years of experience",source_url:src}),false); // unprefixed => HR
  assert.equal(encodeStoredEvidence(job("hr_recruitment","No experience required")),"No experience required");
  assert.equal(storedExperienceEvidence(null),false);
});

test("page check follows the category",()=>{
  assert.equal(pageExperienceOk("We offer free coffee. Requirements: 0-1 years of experience.","sales"),true);
  assert.equal(pageExperienceOk("We have 10 years of history. Requirements: 3 years of experience.","sales"),false);
  assert.equal(pageExperienceOk("Requirements: 1 year of experience.","hr_recruitment"),false);
  const base={title:"Sales Development Representative",company:"Example Company",sourceEvidence:{roleCategory:"sales",language:"English required",eligibility:"Israel eligible"},pageText:"Example Company is hiring a Sales Development Representative in Tel Aviv, Israel. Requirements: 0-1 years of experience in sales or customer-facing roles. Native English. Full-time. Apply now with your CV and a short introduction about yourself."};
  assert.equal(inspectVacancy(base).verified,true);
  assert.equal(inspectVacancy({...base,sourceEvidence:{...base.sourceEvidence,roleCategory:"hr_recruitment"}}).verified,false);
});

// ---- Mock POST /api/private/recruitment/jobs (discovery-key authenticated) ----
const KEY="a".repeat(64);
function mockEnv(){
  const calls=[];
  const stmt=sql=>({bind:(...a)=>({sql,args:a,run:async()=>({meta:{changes:1}}),first:async()=>null,all:async()=>({results:[]})}),run:async()=>({}),first:async()=>null,all:async()=>({results:[]})});
  return {calls,DB:{prepare:stmt,batch:async s=>{calls.push(...s);return []}},ADMIN_PASSWORD_HASH:"100000:x:y",DISCOVERY_WRITE_KEY:KEY};
}
const post=(env,jobs)=>personalApi(new Request("https://w.example/api/private/recruitment/jobs",{method:"POST",headers:{"X-CareerFinder-Discovery-Key":KEY,"Content-Type":"application/json"},body:JSON.stringify({jobs})}),env,new URL("https://w.example/api/private/recruitment/jobs"));
const valid={title:"SDR",company:"Example",url:"https://example.com/jobs/1?utm_source=x",roleCategory:"sales",zeroExperienceEvidence:"0-1 years of sales experience",zeroExperienceSourceUrl:src};

test("POST: valid sales job returns ok and stores category-tagged evidence",async()=>{
  const env=mockEnv();const res=await post(env,[valid]);
  assert.equal(res.status,200);const out=await res.json();assert.equal(out.ok,true);assert.equal(out.received,1);
  const ev=env.calls.find(c=>/recruitment_zero_experience_evidence/.test(c.sql));
  assert.equal(ev.args[1],"[role:sales] 0-1 years of sales experience");
});
test("POST: invalid job (1-2 years / HR 1 year / bad category / no source) returns 400 and writes nothing",async()=>{
  for(const bad of [{...valid,zeroExperienceEvidence:"1-2 years of experience"},{...valid,roleCategory:"hr_recruitment",zeroExperienceEvidence:"1 year of experience"},{...valid,roleCategory:"nope"},{...valid,zeroExperienceSourceUrl:""}]){
    const env=mockEnv();const res=await post(env,[bad]);assert.equal(res.status,400);assert.equal(env.calls.length,0);
  }
  const env=mockEnv();assert.equal((await post(env,[valid,{...valid,url:"https://example.com/jobs/2",zeroExperienceEvidence:"2 years of experience"}])).status,400);assert.equal(env.calls.length,0);
});
