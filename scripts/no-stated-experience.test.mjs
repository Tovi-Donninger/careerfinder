import test from "node:test";
import assert from "node:assert/strict";
import { experienceEvidence, storedExperienceEvidence, encodeStoredEvidence } from "../zero-experience.js";
import { inspectVacancy, otherLanguageRequired } from "./vacancy-verification.mjs";

const src="https://join.jfrog.com/job/7694707";
const reqs="Requirements section in full: English native – Required; German / Hebrew – advantage; Strong communication and interpersonal skills; Ability to multi-task and work in a fast-paced environment; Knowledge of Salesforce and use of sales acceleration tools like Outreach.";
const ev="No experience requirement stated in listing. "+reqs;
const job=(roleCategory,text)=>({roleCategory,zeroExperienceEvidence:text,zeroExperienceSourceUrl:src});

test("non-HR: no stated requirement accepted with a clean requirements quote",()=>{for(const c of ["sales","admin_ops","customer_success"])assert.equal(experienceEvidence(job(c,ev)),true,c)});
test("HR keeps the strict rule",()=>{assert.equal(experienceEvidence(job("hr_recruitment",ev)),false);assert.equal(experienceEvidence(job(undefined,ev)),false)});
test("marker rejected when the quote demands experience or is missing",()=>{
  for(const q of ["Proven sales experience; English native",reqs+" 2+ years in SaaS sales.","Track record of hitting quota and great English skills overall",reqs+" Background in B2B sales.",""," short"])
    assert.equal(experienceEvidence(job("sales","No experience requirement stated in listing. "+q)),false,q);
});
test("stored round trip keeps the rule",()=>{const j=job("sales",ev);assert.equal(storedExperienceEvidence({evidence:encodeStoredEvidence(j),source_url:src}),true)});
const page="Business Development Representative Hybrid position, Monday–Friday. At JFrog, we're reinventing DevOps. Please upgrade your browser to improve your experience. To be a Business Development Representative at JFrog you need... English native – Required German / Hebrew – advantage Strong communication and interpersonal skills Ability to multi-task Knowledge of Salesforce and use of sales acceleration tools like Outreach. Tel Aviv/ Netanya, Israel.";
const base={pageText:page,title:"Business Development Representative",company:"JFrog",sourceEvidence:{roleCategory:"sales",zeroExperience:ev,language:"English native – Required",eligibility:"Israeli citizen; role in Israel"}};
test("runner page check: JFrog-style listing passes",()=>assert.deepEqual(inspectVacancy(base),{verified:true,failures:[]}));
test("runner page check: page that demands experience is stopped",()=>{
  assert.equal(inspectVacancy({...base,pageText:page+" Requirements: 2+ years of sales experience."}).verified,false);
  assert.equal(inspectVacancy({...base,pageText:page+" Proven B2B sales experience."}).verified,false);
});
test("runner page check: HR evidence still needs explicit zero wording",()=>assert.equal(inspectVacancy({...base,sourceEvidence:{...base.sourceEvidence,roleCategory:"hr_recruitment"}}).verified,false));
test("language check: optional languages pass, demanded ones block",()=>{
  for(const t of ["English native – Required German / Hebrew – advantage Strong","Must be a Native English speaker, Hebrew is a plus, but not required","Hebrew is nice to have","German or French would be an advantage","Spanish (preferred)","Hebrew - not required"])assert.equal(otherLanguageRequired(t),false,t);
  for(const t of ["Fluent Hebrew required","Hebrew – required","Hebrew: mandatory","Native Hebrew speaker","Fluency in German","Required: Hebrew and English"])assert.equal(otherLanguageRequired(t),true,t);
});
