import test from "node:test";
import assert from "node:assert/strict";
import { experienceEvidence, pageExperienceOk, preferredExperienceOk, stripPreferredExperience } from "../zero-experience.js";
import { inspectVacancy } from "./vacancy-verification.mjs";

const url="https://example.com/job";
const ok=(e,c)=>experienceEvidence({zeroExperienceEvidence:e,zeroExperienceSourceUrl:url,roleCategory:c});
const CATEGORIES=["admin_ops","sales","customer_success"];

test("preferred / advantage / nice-to-have wording is a fit for all non-HR categories",()=>{
  const phrases=[
    "Experience is an advantage",
    "Experience preferred",
    "Experience is a plus",
    "Experience is nice to have",
    "Nice to have: previous experience",
    "Previous experience is an advantage",
    "Experience - an advantage",
    "Experience is considered an asset",
    "2+ years of experience preferred",
    "3 years preferred",
    "no experience required but 3 years preferred",
    "at least 1 year, ideally 3-5 years experience"
  ];
  for(const c of CATEGORIES)for(const e of phrases)assert.equal(ok(e,c),true,c+": "+e);
});

test("hard requirements above 1 year are still rejected, even if something else is preferred",()=>{
  const phrases=[
    "2+ years of experience required",
    "minimum two years of experience",
    "1-3 years of experience",
    "18 months of experience required",
    "Experience with Salesforce is not required; 2+ years of sales experience",
    "Junior role, 3 years of experience required"
  ];
  for(const c of CATEGORIES)for(const e of phrases)assert.equal(ok(e,c),false,c+": "+e);
});

test("preferred / advantage / nice-to-have wording is a fit for HR too (Tovi, 2026-11-22)",()=>{
  const phrases=[
    "Experience is an advantage",
    "Experience preferred",
    "Nice to have: previous experience",
    "2+ years preferred",
    "Preferred: 1 year of experience in recruitment",
    "At least one year of experience as an HR Coordinator - an advantage",
    "Experience is a plus but not required",
    "no experience required but 3 years preferred"
  ];
  for(const e of phrases){
    assert.equal(ok(e,"hr_recruitment"),true,e);
    assert.equal(preferredExperienceOk(e,"hr_recruitment"),true,e);
    assert.equal(ok(e,undefined),true,"missing category: "+e);
  }
});

test("hard HR experience requirements are still rejected, even when something else is preferred",()=>{
  const phrases=[
    "1+ years HR experience required",
    "1 year of HR experience required",
    "Requires 1 year of experience in recruiting",
    "Must have previous recruiting experience",
    "Previous HR experience is required",
    "1 year of HR experience required. ATS experience is an advantage",
    "minimum one year of recruitment experience"
  ];
  for(const e of phrases){
    assert.equal(ok(e,"hr_recruitment"),false,e);
    assert.equal(preferredExperienceOk(e,"hr_recruitment"),false,e);
  }
});

test("page check accepts preferred wording and still rejects hard years",()=>{
  assert.equal(pageExperienceOk("Operations & Administration Coordinator. Experience is an advantage. Excellent English. Ben Gurion Airport.","admin_ops"),true);
  assert.equal(pageExperienceOk("Graduate Customer Success Manager. Experience preferred. Excellent English. Remote, worldwide.","customer_success"),true);
  assert.equal(pageExperienceOk("Operations Coordinator. Experience is an advantage. 3 years of operations experience required.","admin_ops"),false);
  assert.equal(pageExperienceOk("Recruiter wanted. Experience is an advantage.","hr_recruitment"),true);
  assert.equal(pageExperienceOk("Recruiter wanted. Preferred: 1 year of experience in recruitment.","hr_recruitment"),true);
  assert.equal(pageExperienceOk("Recruiter wanted. 1+ years HR experience required.","hr_recruitment"),false);
});

test("stripPreferredExperience removes only preferred year clauses",()=>{
  assert.match(stripPreferredExperience("no experience required but 3 years preferred"),/no experience required/i);
  assert.doesNotMatch(stripPreferredExperience("no experience required but 3 years preferred"),/\b3 years\b/i);
  assert.match(stripPreferredExperience("at least 1 year, ideally 3-5 years experience"),/at least 1 year/i);
  assert.doesNotMatch(stripPreferredExperience("at least 1 year, ideally 3-5 years experience"),/3-5/);
  assert.match(stripPreferredExperience("2+ years of experience required"),/2\+ years/i);
});

test("runner page check: Challenge Group-style 'experience is an advantage' passes for admin_ops",()=>{
  const r=inspectVacancy({title:"Operations & Administration Coordinator",company:"Challenge Group",sourceEvidence:{roleCategory:"admin_ops",zeroExperience:"Experience is an advantage",language:"English required",eligibility:"Israel; Ben Gurion Airport"},pageText:"Challenge Group is hiring an Operations & Administration Coordinator at Ben Gurion Airport, Israel. This is a 70% part-time role. Requirements: experience is an advantage, excellent English, organised and proactive. Apply with your CV."});
  assert.equal(r.verified,true,r.failures.join("; "));
});

test("runner page check: preferred wording on a no-stated evidence page still verifies",()=>{
  const r=inspectVacancy({title:"Customer Support Representative",company:"Example Company",sourceEvidence:{roleCategory:"customer_success",zeroExperience:"No experience requirement stated in listing. Requirements section in full: excellent English; organised and proactive; full-time in Tel Aviv, Israel.",language:"English required",eligibility:"Israel eligible"},pageText:"Example Company is hiring a Customer Support Representative in Tel Aviv, Israel. Requirements: experience is an advantage, excellent English, organised and proactive. Full-time role in our support team. Apply with your CV."});
  assert.equal(r.verified,true,r.failures.join("; "));
});

test("runner page check: InfinityLabs-style preferred recruitment experience passes for HR",()=>{
  const r=inspectVacancy({title:"Talent Acquisition Coordinator",company:"InfinityLabs",sourceEvidence:{roleCategory:"hr_recruitment",zeroExperience:"Preferred: 1 year of experience in recruitment",language:"English required",eligibility:"Israel; Ramat Gan"},pageText:"InfinityLabs R&D is hiring a Talent Acquisition Coordinator in Ramat Gan, Israel. What we are looking for: Bachelor's degree in a relevant field. Preferred: 1 year of experience in recruitment. Strong communication skills, with proven orientation to sales or business development - a strong advantage. Full-time availability. Excellent English. Apply with your CV."});
  assert.equal(r.verified,true,r.failures.join("; "));
});

test("runner page check: SQLink-style HR coordinator advantage wording passes for HR",()=>{
  const r=inspectVacancy({title:"Junior HR Coordinator",company:"SQLink",sourceEvidence:{roleCategory:"hr_recruitment",zeroExperience:"At least one year of experience as an HR Coordinator - an advantage",language:"English required",eligibility:"Israel; Jerusalem"},pageText:"SQLink Group is hiring a Junior HR Coordinator in Jerusalem, Israel. What are we looking for? Bachelor's degree - mandatory. At least one year of experience as an HR Coordinator - an advantage. Knowledge of labor laws and experience in drafting employment contracts - an advantage. Excellent English. Apply with your CV."});
  assert.equal(r.verified,true,r.failures.join("; "));
});
