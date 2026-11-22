import test from "node:test";
import assert from "node:assert/strict";
import { detectAdapter, leverUrls, isComeetApplyFrame, toE164, CONFIRMATION, confirmationHostOk } from "./form-adapters.mjs";
const AK="https://www.comeet.com/jobs/akeyless/27.006/business-development-representative-bdr--international/5F.07D";
test("adapter detection",()=>{
  assert.equal(detectAdapter(AK),"comeet");
  assert.equal(detectAdapter("https://jobs.lever.co/cloudinary/79bfaff4-eabd-40a8-975d-d6be4b06a09f"),"lever");
  assert.equal(detectAdapter("https://job-boards.greenhouse.io/similarweb/jobs/123"),"greenhouse");
  assert.equal(detectAdapter("https://careers.myheritage.com/jobs/8399105?gh_jid=8399105"),"greenhouse");
  assert.equal(detectAdapter("https://example.com/careers/1"),"generic");
  assert.equal(detectAdapter("not a url"),"invalid");
});
test("lever posting and apply URLs",()=>{
  const id="79bfaff4-eabd-40a8-975d-d6be4b06a09f";
  for(const u of ["https://jobs.lever.co/cloudinary/"+id,"https://jobs.lever.co/cloudinary/"+id+"/apply"])assert.deepEqual(leverUrls(u),{posting:"https://jobs.lever.co/cloudinary/"+id,apply:"https://jobs.lever.co/cloudinary/"+id+"/apply"});
  assert.equal(leverUrls("https://jobs.lever.co/cloudinary"),null);
});
test("comeet apply iframe recognised",()=>{
  assert.equal(isComeetApplyFrame("https://www.comeet.co/jobs/27.006/5F.07D/apply?token=x&embedded=true"),true);
  assert.equal(isComeetApplyFrame("https://www.comeet.co/jobs/27.006/5F.07D/social?token=x"),false);
  assert.equal(isComeetApplyFrame(AK),false);
});
test("E.164 phone",()=>{
  assert.equal(toE164("+972 54-123 4567"),"+972541234567");
  assert.equal(toE164("054-123-4567"),"+972541234567");
  assert.equal(toE164("972541234567"),"+972541234567");
  assert.equal(toE164("00972541234567"),"+972541234567");
  assert.equal(toE164("12345"),"");
});
test("confirmation wording incl. Comeet and Lever",()=>{
  for(const t of ["Thank you! Your application has been submitted. Good luck!","Application submitted!","Thank you for applying","We have received your application"])assert.ok(CONFIRMATION.test(t),t);
  for(const t of ["Submit application","Apply for this job","Please complete the required fields"])assert.equal(CONFIRMATION.test(t),false,t);
});
test("confirmation host must belong to the employer or its ATS",()=>{
  assert.equal(confirmationHostOk(AK,AK),true);
  assert.equal(confirmationHostOk("https://www.comeet.co/jobs/27.006/5F.07D/apply?x=1",AK),true);
  assert.equal(confirmationHostOk("https://jobs.lever.co/a/b/thanks","https://jobs.lever.co/a/b"),true);
  assert.equal(confirmationHostOk("https://evil.example/thanks",AK),false);
  assert.equal(confirmationHostOk("http://www.comeet.com/x",AK),false);
});

import { visibleFormError } from "./form-adapters.mjs";
test("form error wording is detected, success and neutral text is not",()=>{
  assert.ok(visibleFormError(["First name is required"]));
  assert.ok(visibleFormError(["", "Please enter a valid email"]));
  assert.ok(visibleFormError(["Something went wrong. Please try again."]));
  assert.equal(visibleFormError(["Thank you for applying!","We will be in touch"]),"");
  assert.equal(visibleFormError([]),"");
  assert.equal(visibleFormError(undefined),"");
});
