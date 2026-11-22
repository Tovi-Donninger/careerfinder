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

test("HR stays strict on preferred wording",()=>{
  for(const e of ["Experience is an advantage","Experience preferred","Nice to have: previous experience","2+ years preferred"]){
    assert.equal(ok(e,"hr_recruitment"),false,e);
    assert.equal(preferredExperienceOk(e,"hr_recruitment"),false,e);
  }
});

test("page check accepts preferred wording and still rejects hard years",()=>{
  assert.equal(pageExperienceOk("Operations & Administration Coordinator. Experience is an advantage. Excellent English. Ben Gurion Airport.","admin_ops"),true);
  assert.equal(pageExperienceOk("Graduate Customer Success Manager. Experience preferred. Excellent English. Remote, worldwide.","customer_success"),true);
  assert.equal(pageExperienceOk("Operations Coordinator. Experience is an advantage. 3 years of operations experience required.","admin_ops"),false);
  assert.equal(pageExperienceOk("Recruiter wanted. Experience is an advantage.","hr_recruitment"),false);
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
