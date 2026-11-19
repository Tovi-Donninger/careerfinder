import test from "node:test";
import assert from "node:assert/strict";
import { zeroExperienceEvidence } from "../zero-experience.js";
import { inspectVacancy } from "./vacancy-verification.mjs";
const src="https://example.com/job";
test("HR evidence allows one subject word between 'prior' and 'experience'",()=>{
  for(const e of ["No prior recruiting experience required","No previous HR experience is required","No prior recruitment experience needed","No prior experience required"])
    assert.equal(zeroExperienceEvidence({zeroExperienceEvidence:e,zeroExperienceSourceUrl:src}),true,e);
});
test("HR evidence stays strict",()=>{
  for(const e of ["Prior recruiting experience required","No prior recruiting or sales experience required? 2 years of recruiting experience","Some recruiting experience required"])
    assert.equal(zeroExperienceEvidence({zeroExperienceEvidence:e,zeroExperienceSourceUrl:src}),false,e);
});
test("HR employer page accepts 'No prior recruiting experience required'",()=>{
  const r=inspectVacancy({title:"Junior Talent Acquisition",company:"PickPeak",sourceEvidence:{roleCategory:"hr_recruitment",language:"English required",eligibility:"Israel eligible"},pageText:"PickPeak is hiring a Junior Talent Acquisition specialist in Israel. No prior recruiting experience required. You will source candidates and coordinate interviews with hiring managers across our client companies."});
  assert.equal(r.verified,true,r.failures.join("; "));
});
