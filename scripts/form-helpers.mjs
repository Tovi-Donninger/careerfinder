// Pure helpers for the employer form executor (kept separate so they can be unit tested).

// Digits only, keeping the country code digits (e.g. "+972 54-123 4567" -> "972541234567").
export function digitsOnlyPhone(value) {
  return String(value||"").replace(/\D/g,"");
}
// True when a phone field can only take digits: type=number, or a pattern/inputmode
// that allows digits only (e.g. "[0-9]*", "\\d{9,15}", inputmode="numeric").
export function phoneFieldNeedsDigits({type="",pattern="",inputMode=""}={}) {
  if(String(type).toLowerCase()==="number")return true;
  if(String(inputMode).toLowerCase()==="numeric")return true;
  const p=String(pattern||"").trim();
  if(!p)return false;
  return /^\^?(?:\[0-9\]|\\d)(?:\*|\+|\{\d+(?:,\d*)?\})?\$?$/.test(p);
}
// Final-submit button labels accepted inside the application form only.
export const SUBMIT_LABEL=/^\s*(?:apply|apply now|submit application|send application|submit)\s*$/i;
export function pickSubmitButton(buttons) {
  // buttons: [{label, visible}] found inside the application form.
  const matches=buttons.filter(b=>b.visible&&SUBMIT_LABEL.test(String(b.label||"")));
  return matches.length===1?matches[0]:null;
}

// Which candidate identity field is this input? Returns "firstName"|"lastName"|"fullName"|"email"|"phone"|"linkedin"|null.
// Looks at type, autocomplete, name, id, placeholder and label. Honeypots ("leave this field blank"),
// company/parent/father/mother/referral names and anything unrecognised return null.
export function classifyIdentityField({type="",autocomplete="",name="",id="",placeholder="",label=""}={}) {
  const t=String(type).toLowerCase();
  const text=[name,id,placeholder,label].map(s=>String(s||"").toLowerCase().replace(/[_\-.]+/g," ").replace(/([a-z])([A-Z])/g,"$1 $2")).join(" | ");
  if(/leave (?:this|it)[^|]{0,20}blank|do not fill|honeypot|nickname|company|father|mother|maiden|referr|reference|emergency|manager|employer|school|website|portfolio|notes?\b/.test(text))return null;
  const ac=String(autocomplete).toLowerCase();
  if(t==="email"||ac==="email"||/\be ?mail\b/.test(text))return "email";
  if(t==="tel"||ac==="tel"||/\b(?:phone|mobile|cell)\b/.test(text))return "phone";
  if(/linkedin/.test(text))return "linkedin";
  if(ac==="given-name"||/\bfirst ?name\b|\bgiven name\b|\bfname\b/.test(text))return "firstName";
  if(ac==="family-name"||/\blast ?name\b|\bsurname\b|\bfamily name\b|\blname\b/.test(text))return "lastName";
  if(ac==="name"||/\bfull ?name\b|\byour name\b|^(?:career )?name\b|\|\s*name\s*(?:\*)?\s*(?:\||$)|^name\b/.test(text))return "fullName";
  return null;
}
// Visible label of a control that opens the application form on the job page.
export const APPLY_OPENER_LABEL=/^\s*(?:apply|apply now|apply here|apply for (?:this|the) (?:job|position|role)|apply to this job|i'?m interested)\s*$/i;
