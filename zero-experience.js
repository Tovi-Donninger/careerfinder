// Fail-closed evidence gates for the experience requirement of a vacancy.
// This is not a substitute for checking the original employer posting.
//
// Rule (see CAREERFINDER_RECRUITMENT_RULES.md):
//  - hr_recruitment (or no roleCategory): zero experience, explicit evidence only.
//  - admin_ops, sales, customer_success: zero experience OR at most 1 year required.
export const ROLE_CATEGORIES=["hr_recruitment","admin_ops","sales","customer_success"];
const EXPLICIT_ZERO=/\b(no (?:(?:prior|previous|professional|relevant|work) (?:[a-z][a-z-]* )?)?experience (?:is )?(?:required|necessary|needed)|no experience needed|no experience necessary|without (?:any |prior |previous )?experience|no previous work experience|no prior work experience|experience (?:is )?not required|previous experience (?:is )?not required|(?:zero|0) (?:years? of )?experience required)\b/i;

export function zeroExperienceEvidence(job) {
  const evidence=String(job.zeroExperienceEvidence||"").trim();
  const url=String(job.zeroExperienceSourceUrl||"").trim();
  if(!evidence||!/^https:\/\//i.test(url))return false;
  const explicit=EXPLICIT_ZERO.test(evidence);
  const contradictory=/\b(?:[1-9]\d*\+?\s*(?:years?|yrs?)|minimum (?:of )?(?:one|two|three|four|five) years?)\b/i.test(evidence);
  return explicit&&!contradictory;
}

// Normalise a category: undefined/empty => null (treated as HR); unknown => false (rejected).
export function normalizeRoleCategory(value) {
  if(value===undefined||value===null||value==="")return null;
  if(typeof value!=="string")return false;
  const v=value.trim().toLowerCase();
  return ROLE_CATEGORIES.includes(v)?v:false;
}

const NUM_WORDS={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
const WORD_RE="one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve";
const toNum=s=>{const x=String(s).toLowerCase();return x in NUM_WORDS?NUM_WORDS[x]:parseFloat(x)};

// True when the text mentions any requirement above one year.
function exceedsOneYear(text) {
  for(const m of text.matchAll(new RegExp("\\b(\\d+(?:\\.\\d+)?|"+WORD_RE+")\\s*(?:\\+|plus)?\\s*(?:years?|yrs?)\\b","gi")))if(toNum(m[1])>1)return true;
  if(/\b(?:several|multiple|many|few|couple of|numerous)\s+years?\b/i.test(text))return true;
  for(const m of text.matchAll(new RegExp("\\b(\\d+(?:\\.\\d+)?|"+WORD_RE+")\\s*(?:\\+|plus)?\\s*months?\\b","gi")))if(toNum(m[1])>12)return true;
  if(/\b(?:thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\S*\s+months?\b/i.test(text))return true;
  if(/\b(?:more than|over|exceeding|in excess of)\s+(?:a|an|one|1)\s+(?:year|yr)\b/i.test(text))return true;
  return false;
}

// True when the text explicitly states a requirement of at most one year.
function statesAtMostOneYear(text) {
  if(!/experience|exp\./i.test(text))return false;
  return /\b(?:0|zero)\s*(?:\+\s*)?(?:-|–|—|to)\s*(?:1|one)\s*(?:years?|yrs?)\b/i.test(text)
    ||/\b(?:at least|minimum(?: of)?|up to|under|less than|about|around|approximately|maximum(?: of)?|max(?:imum)? of)\s+(?:a|an|one|1)\s*(?:year|yr)s?\b/i.test(text)
    ||/\b(?:1|one)\s*\+?\s*(?:years?|yrs?)\b/i.test(text)
    ||new RegExp("\\b(?:\\d+|"+WORD_RE+")\\s*\\+?\\s*months?\\b","i").test(text);
}

// Non-HR listings that state no experience requirement at all (Tovi, 2026-11-18).
// Evidence must start with this marker and then quote the listing's requirements;
// the quote must contain no experience, track-record or years/months demand.
export const NO_STATED_EXPERIENCE=/^no experience requirement stated in (?:the )?listing\b/i;
const EXPERIENCE_DEMAND=/(?:\bexperience\b|track record|\bbackground in\b|\bseasoned\b|\bsenior\b|\b(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*\+?\s*(?:years?|yrs?|months?)\b|\byears? of\b)/i;
export function noStatedExperienceEvidence(evidence) {
  const text=String(evidence||"").trim();
  if(!NO_STATED_EXPERIENCE.test(text))return false;
  const quote=text.replace(NO_STATED_EXPERIENCE,"").replace(/^[\s.:;,–—-]+/,"");
  if(quote.length<40)return false; // the requirements quote itself is mandatory
  return !EXPERIENCE_DEMAND.test(quote)&&!exceedsOneYear(quote);
}
// Page check for such listings: the live page must not demand experience anywhere.
const PAGE_EXPERIENCE_DEMAND=/(?:\b(?:proven|previous|prior|relevant|professional|work|sales|b2b|saas|industry|hands[- ]on|demonstrated|related)\s+(?:\w+\s+)?experience\b|\bexperience (?:in|with|as|of|working)\b|track record|\byears? of\b|\b(?:\d+(?:\.\d+)?|one|two|three|four|five)\s*\+?\s*(?:years?|yrs?)\b)/i;
export function pageHasNoExperienceDemand(pageText) {
  const text=String(pageText||"");
  return !PAGE_EXPERIENCE_DEMAND.test(text)&&!exceedsOneYear(text);
}

// Non-HR only: wording that says experience is optional or that the role is entry level/junior.
// Always combined with exceedsOneYear, so "junior, 3 years of experience" is still rejected.
export const NON_HR_OPEN_EXPERIENCE=/\bexperience\b[^.;\n]{0,160}?\bnot (?:required|mandatory|necessary|a must)\b|\bentry[- ]level\b|\bmin(?:imum|\.)?\s*experience\s*:?\s*(?:entry[- ]level|none|0)\b|\bjunior\b/i;

// Admin/ops and sales only (Tovi, 2026-11-19): "previous/proven/relevant/prior experience"
// (or a plain role-subject phrase like "B2C phone sales experience", "proven track record")
// with no number of years counts as a fit. Anything stating more than 1 year still fails
// (exceedsOneYear is always checked first). HR stays strict.
export const UNQUANTIFIED_EXPERIENCE_CATEGORIES=["admin_ops","sales"];
export const UNQUANTIFIED_EXPERIENCE=/\b(?:(?:previous|proven|relevant|prior|sales|b2b|b2c|phone|telesales|telemarketing|office|administrative|admin|operations|client[- ]facing|customer[- ]facing)\s+(?:[a-z0-9][a-z0-9/&-]*\s+){0,3}?experience\b|proven track record\b)/i;
export function unquantifiedExperienceOk(text, roleCategory) {
  const category=normalizeRoleCategory(roleCategory);
  if(!UNQUANTIFIED_EXPERIENCE_CATEGORIES.includes(category))return false;
  const t=String(text||"");
  const sentences=t.split(/(?<=[.!?\n])\s+|\n+/).filter(x=>/experience|years?|yrs?|months?/i.test(x)).join(" . ");
  return UNQUANTIFIED_EXPERIENCE.test(t)&&!exceedsOneYear(sentences);
}

// Role-aware gate. job: {zeroExperienceEvidence, zeroExperienceSourceUrl, roleCategory?}
export function experienceEvidence(job) {
  const category=normalizeRoleCategory(job.roleCategory);
  if(category===false)return false;
  if(category===null||category==="hr_recruitment")return zeroExperienceEvidence(job);
  const evidence=String(job.zeroExperienceEvidence||"").trim();
  const url=String(job.zeroExperienceSourceUrl||"").trim();
  if(!evidence||!/^https:\/\//i.test(url))return false;
  if(NO_STATED_EXPERIENCE.test(evidence))return noStatedExperienceEvidence(evidence);
  if(exceedsOneYear(evidence))return false;
  return EXPLICIT_ZERO.test(evidence)||statesAtMostOneYear(evidence)||NON_HR_OPEN_EXPERIENCE.test(evidence)||unquantifiedExperienceOk(evidence,category);
}

// The evidence table has no category column, so non-HR categories are stored as a
// "[role:<category>] " prefix on the evidence text (no schema change). HR stays unprefixed.
export function encodeStoredEvidence(job) {
  const evidence=String(job.zeroExperienceEvidence||"").trim().slice(0,1500);
  const category=normalizeRoleCategory(job.roleCategory);
  return category&&category!=="hr_recruitment"?"[role:"+category+"] "+evidence:evidence;
}
export function decodeStoredEvidence(stored) {
  const m=/^\[role:(admin_ops|sales|customer_success)\] ([\s\S]*)$/.exec(String(stored||""));
  return m?{roleCategory:m[1],evidence:m[2]}:{roleCategory:"hr_recruitment",evidence:String(stored||"")};
}
// Gate for a row of recruitment_zero_experience_evidence ({evidence,source_url} or aliased names).
export function storedExperienceEvidence(row) {
  if(!row)return false;
  const d=decodeStoredEvidence(row.evidence??row.zeroExperienceEvidence);
  return experienceEvidence({zeroExperienceEvidence:d.evidence,zeroExperienceSourceUrl:row.source_url??row.zeroExperienceSourceUrl,roleCategory:d.roleCategory});
}

// Page-level check used by the browser executor: only sentences that talk about experience count.
export function pageExperienceOk(pageText, roleCategory) {
  const category=normalizeRoleCategory(roleCategory);
  if(category===false)return false;
  const text=String(pageText||"");
  if(category===null||category==="hr_recruitment")return EXPLICIT_ZERO.test(text);
  const sentences=text.split(/(?<=[.!?\n])\s+|\n+/).filter(s=>/experience|years?|months?/i.test(s)).join(" . ");
  if(exceedsOneYear(sentences))return false;
  return EXPLICIT_ZERO.test(text)||statesAtMostOneYear(sentences)||NON_HR_OPEN_EXPERIENCE.test(text)||unquantifiedExperienceOk(text,category);
}
