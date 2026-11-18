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
