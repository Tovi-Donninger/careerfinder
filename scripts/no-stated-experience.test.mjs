import test from "node:test";
import assert from "node:assert/strict";
import { experienceEvidence, storedExperienceEvidence, encodeStoredEvidence } from "../zero-experience.js";
import { inspectVacancy, otherLanguageRequired } from "./vacancy-verification.mjs";

const src="https://join.jfrog.com/job/7694707";
const reqs="Requirements section in full: English native – Required; German / Hebrew – advantage; Strong communication and interpersonal skills; Ability to multi-task and work in a fast-paced environment; Knowledge of Salesforce and use of sales acceleration tools like Outreach.";
const ev="No experience requirement stated in listing. "+reqs;
const job=(roleCategory,text)=>({roleCategory,zeroExperienceEvidence:text,zeroExperienceSourceUrl:src});

test("non-HR: no stated requirement accepted with a clean requirements quote",()=>{for(const c of ["sales","admin_ops","customer_success"])assert.equal(experienceEvidence(job(c,ev)),true,c)});
test("HR accepts no stated requirement with a clean requirements quote (Tovi, 2026-11-22)",()=>{assert.equal(experienceEvidence(job("hr_recruitment",ev)),true);assert.equal(experienceEvidence(job(undefined,ev)),true)});
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
  assert.equal(inspectVacancy({...base,pageText:page+" Proven B2B sales experience for 3 years."}).verified,false);
});
test("runner page check: unquantified proven experience is a fit for sales and customer success (Tovi, 2026-11-22)",()=>{
  assert.equal(inspectVacancy({...base,pageText:page+" Proven B2B sales experience."}).verified,true);
  assert.equal(inspectVacancy({...base,sourceEvidence:{...base.sourceEvidence,roleCategory:"customer_success"},pageText:page+" Proven B2B sales experience."}).verified,true);
});
test("runner page check: HR accepts a no-stated-requirement page (Tovi, 2026-11-22)",()=>assert.equal(inspectVacancy({...base,sourceEvidence:{...base.sourceEvidence,roleCategory:"hr_recruitment"}}).verified,true));
test("language check: optional languages pass, demanded ones block",()=>{
  for(const t of ["English native – Required German / Hebrew – advantage Strong","Must be a Native English speaker, Hebrew is a plus, but not required","Hebrew is nice to have","German or French would be an advantage","Spanish (preferred)","Hebrew - not required"])assert.equal(otherLanguageRequired(t),false,t);
  for(const t of ["Fluent Hebrew required","Hebrew – required","Hebrew: mandatory","Native Hebrew speaker","Fluency in German","Required: Hebrew and English"])assert.equal(otherLanguageRequired(t),true,t);
});

test("non-HR: optional / entry-level / junior wording accepted",()=>{
  for(const t of ["Previous sales experience is considered an asset but is not required","Experience with CRM tools is a plus, but not required","Experience is an advantage but not required","Entry Level","This is an entry-level role","Min. Experience: Entry Level","0-1 years of experience","Up to 1 year of experience","Junior Sales Development Representative"])
    for(const c of ["sales","admin_ops","customer_success"])assert.equal(experienceEvidence(job(c,t)),true,c+": "+t);
});
test("non-HR: optional wording still rejected when more than a year is demanded",()=>{
  for(const t of ["Junior role, 3 years of experience required","Entry level, minimum two years of experience","Experience with Salesforce is not required; 2+ years of sales experience"])assert.equal(experienceEvidence(job("sales",t)),false,t);
});
test("HR still rejects junior/entry-level titles alone and hard 0-1 year requirements",()=>{
  for(const t of ["Entry Level","Junior Recruiter","Min. Experience: Entry Level","0-1 years of experience"])assert.equal(experienceEvidence(job("hr_recruitment",t)),false,t);
});
test("HR accepts preferred/optional experience wording",()=>{
  for(const t of ["Experience is a plus but not required","Experience is an advantage","Experience preferred"])assert.equal(experienceEvidence(job("hr_recruitment",t)),true,t);
});
test("runner page check accepts entry-level / optional wording for non-HR only",()=>{
  const p="Customer Support Representative at Example Co, Tel Aviv, Israel. Min. Experience: Entry Level. Previous support experience is considered an asset but is not required. Native English. We offer training and a great team. Apply with your CV.";
  const b={pageText:p,title:"Customer Support Representative",company:"Example Co",sourceEvidence:{roleCategory:"customer_success",zeroExperience:"Min. Experience: Entry Level",language:"Native English",eligibility:"Israeli citizen; role in Israel"}};
  assert.deepEqual(inspectVacancy(b),{verified:true,failures:[]});
  assert.equal(inspectVacancy({...b,pageText:p+" Requirements: 2+ years of support experience."}).verified,false);
  assert.equal(inspectVacancy({...b,sourceEvidence:{...b.sourceEvidence,roleCategory:"hr_recruitment"}}).verified,true);
  assert.equal(inspectVacancy({title:"Junior Recruiter",company:"Example Co",sourceEvidence:{roleCategory:"hr_recruitment",zeroExperience:"Min. Experience: Entry Level",language:"Native English",eligibility:"Israeli citizen; role in Israel"},pageText:"Junior Recruiter at Example Co, Tel Aviv, Israel. Min. Experience: Entry Level. Native English. We offer training and a great team. Apply with your CV to join the HR team today."}).verified,false);
});
