// Which application-form adapter handles an employer URL, and URL/phone helpers.
// Pure module (unit tested); the browser steps live in employer-form-executor.mjs.

export function detectAdapter(href){
  let u;try{u=new URL(href)}catch{return "invalid"}
  const h=u.hostname.toLowerCase();
  if(/(^|\.)comeet\.(?:com|co)$/.test(h)&&/^\/jobs\//.test(u.pathname))return "comeet";
  if(h==="jobs.lever.co"||h==="jobs.eu.lever.co")return "lever";
  if(/(^|\.)greenhouse\.io$/.test(h)||u.searchParams.has("gh_jid"))return "greenhouse";
  return "generic";
}
// jobs.lever.co/<company>/<uuid>[/apply] -> {posting, apply}
export function leverUrls(href){
  const u=new URL(href);
  const m=u.pathname.match(/^\/([^/]+)\/([0-9a-f-]{36})(?:\/apply)?\/?$/i);
  if(!m)return null;
  const base=u.origin+"/"+m[1]+"/"+m[2];
  return {posting:base,apply:base+"/apply"};
}
// Comeet's embedded form lives in an iframe on comeet.co: /jobs/<company-uid>/<position-uid>/apply?...
export function isComeetApplyFrame(href){
  try{const u=new URL(href);return /(^|\.)comeet\.co$/.test(u.hostname)&&/^\/jobs\/[^/]+\/[^/]+\/apply$/.test(u.pathname)}catch{return false}
}
// E.164 for the phone widget. Israeli local numbers (05x..., 0x...) become +972...
export function toE164(phone,country="Israel"){
  const raw=String(phone||"").trim();
  const digits=raw.replace(/\D/g,"");
  if(!digits)return "";
  if(raw.startsWith("+"))return "+"+digits;
  if(digits.startsWith("00"))return "+"+digits.slice(2);
  if(/^972\d{8,9}$/.test(digits))return "+"+digits;
  if(/israel/i.test(country)&&/^0\d{8,9}$/.test(digits))return "+972"+digits.slice(1);
  return "";
}
// Employer confirmation wording (top page or the form frame).
export const CONFIRMATION=/(?:thank you for (?:applying|your application)|application (?:has been |was )?(?:successfully )?(?:submitted|received|sent)|we (?:have )?received your application|successfully applied|your application has been submitted)/i;
// Hosts allowed as the confirmation page for an adapter, besides the vacancy host itself.
export function confirmationHostOk(confirmationUrl,jobUrl){
  let c,j;try{c=new URL(confirmationUrl);j=new URL(jobUrl)}catch{return false}
  if(c.protocol!=="https:")return false;
  if(c.hostname===j.hostname)return true;
  const ats=/(^|\.)(?:comeet\.co|comeet\.com|lever\.co|greenhouse\.io)$/i;
  return ats.test(c.hostname)&&ats.test(j.hostname)||(/[?&]gh_jid=/.test(j.search)&&/(^|\.)greenhouse\.io$/i.test(c.hostname));
}
