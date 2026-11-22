import test from "node:test";
import assert from "node:assert/strict";
import { digitsOnlyPhone, phoneFieldNeedsDigits, pickSubmitButton } from "./form-helpers.mjs";

test("digits-only phone keeps the country code",()=>{
  assert.equal(digitsOnlyPhone("+972 54-123 4567"),"972541234567");
  assert.equal(digitsOnlyPhone("(054) 123 4567"),"0541234567");
  assert.equal(digitsOnlyPhone(""),"");
});
test("numeric phone fields are detected",()=>{
  for(const a of [{type:"number"},{pattern:"[0-9]*"},{pattern:"\\d{9,15}"},{pattern:"^\\d+$"},{inputMode:"numeric"}])assert.equal(phoneFieldNeedsDigits(a),true,JSON.stringify(a));
  for(const a of [{type:"tel"},{type:"text",pattern:"[+0-9 -]*"},{}])assert.equal(phoneFieldNeedsDigits(a),false,JSON.stringify(a));
});
test("exactly one visible accepted button is chosen",()=>{
  for(const label of ["Apply","Apply now","Apply Now","Submit application","Send application","Submit"])assert.ok(pickSubmitButton([{label,visible:true},{label:"Upload CV",visible:true}]),label);
  assert.equal(pickSubmitButton([{label:"Apply",visible:true},{label:"Submit",visible:true}]),null);
  assert.equal(pickSubmitButton([{label:"Apply",visible:false}]),null);
  assert.equal(pickSubmitButton([{label:"Apply with LinkedIn",visible:true}]),null);
  assert.equal(pickSubmitButton([{label:"Next",visible:true}]),null);
});

import { classifyIdentityField, APPLY_OPENER_LABEL } from "./form-helpers.mjs";
test("identity fields are recognised from name, placeholder, label and autocomplete",()=>{
  const c=classifyIdentityField;
  assert.equal(c({name:"firstname",autocomplete:"given-name",placeholder:"First name*"}),"firstName");
  assert.equal(c({name:"lastName",label:"Last Name *"}),"lastName");
  assert.equal(c({name:"registrationFirstName",placeholder:"First name"}),"firstName");
  assert.equal(c({name:"Career-Name",id:"Career-Name",placeholder:"Full name *"}),"fullName");
  assert.equal(c({name:"Name",autocomplete:"name",placeholder:"Full name"}),"fullName");
  assert.equal(c({type:"email",name:"Career-Email"}),"email");
  assert.equal(c({name:"email",placeholder:"Business email*"}),"email");
  assert.equal(c({type:"tel",name:"Career-Phone"}),"phone");
  assert.equal(c({name:"mobilephone",autocomplete:"tel"}),"phone");
  assert.equal(c({name:"phone",label:"Phone *"}),"phone");
  assert.equal(c({name:"linkedinUrl",label:"LinkedIn URL"}),"linkedin");
});
test("honeypots, companies, relatives and notes are never treated as identity fields",()=>{
  const c=classifyIdentityField;
  assert.equal(c({name:"nickname_hpcsaf",label:"Please leave this field blank"}),null);
  assert.equal(c({name:"Company",placeholder:"Company name"}),null);
  assert.equal(c({name:"registrationFatherFirstName",placeholder:"First name"}),null);
  assert.equal(c({name:"Career-Notes",type:"tel",placeholder:"Notes"}),null);
  assert.equal(c({name:"website",placeholder:"Website address"}),null);
  assert.equal(c({name:"desiredPay",label:"Desired Pay *"}),null);
  assert.equal(c({}),null);
});
test("apply opener labels",()=>{
  for(const l of ["Apply","Apply for This Job","APPLY NOW"])assert.ok(APPLY_OPENER_LABEL.test(l),l);
  for(const l of ["Applied","Application FAQ","Submit application","Apply with LinkedIn"])assert.ok(!APPLY_OPENER_LABEL.test(l),l);
});
