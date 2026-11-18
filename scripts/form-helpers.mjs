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
