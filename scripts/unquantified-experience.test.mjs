import test from "node:test";
import assert from "node:assert/strict";
import { experienceEvidence, pageExperienceOk } from "../zero-experience.js";
import { inspectVacancy } from "./vacancy-verification.mjs";
const url="https://example.com/job";
const ok=(e,c)=>experienceEvidence({zeroExperienceEvidence:e,zeroExperienceSourceUrl:url,roleCategory:c});
test("admin_ops and sales accept unquantified previous/proven/relevant experience",()=>{
  for(const c of ["admin_ops","sales"])for(const e of ["Previous experience as an office manager - advantage","Proven sales experience","Relevant experience in B2B sales","Prior administrative experience required","B2C phone sales experience","Proven track record of hitting and exceeding sales targets","Previous experience in office management, client service or a similar role"])assert.equal(ok(e,c),true,c+": "+e);
});
test("anything stating more than 1 year still fails",()=>{
  for(const c of ["admin_ops","sales"])for(const e of ["Proven sales experience of 2+ years","Previous experience (3 years) as an office manager","Relevant experience: at least two years","Proven experience, several years in B2B sales","B2C phone sales experience (2+ years)","Proven track record over 3 years"])assert.equal(ok(e,c),false,c+": "+e);
});
test("HR and customer success are unchanged",()=>{
  assert.equal(ok("Previous recruiting experience","hr_recruitment"),false);
  assert.equal(ok("Previous recruiting experience",undefined),false);
  assert.equal(ok("Proven customer success experience","customer_success"),false);
});
test("page check accepts unquantified wording for sales, rejects years",()=>{
  assert.equal(pageExperienceOk("We are hiring an SDR. Requirements: proven sales experience. Excellent English.","sales"),true);
  assert.equal(pageExperienceOk("We are hiring an SDR. Requirements: proven sales experience of 3 years.","sales"),false);
  assert.equal(pageExperienceOk("Office manager wanted. Previous experience as an office manager.","admin_ops"),true);
  assert.equal(pageExperienceOk("Recruiter wanted. Previous recruiting experience.","hr_recruitment"),false);
});
test("no-stated evidence plus page with unquantified wording passes for admin_ops",()=>{
  const r=inspectVacancy({title:"Office Manager",company:"Example Company",sourceEvidence:{roleCategory:"admin_ops",zeroExperience:"No experience requirement stated in listing",language:"English required",eligibility:"Israel eligible"},pageText:"Example Company is hiring an Office Manager in Tel Aviv, Israel. Requirements: previous experience as an office manager, excellent English, organised and proactive. Full-time role in our friendly office team."});
  assert.equal(r.verified,true,r.failures.join("; "));
});
