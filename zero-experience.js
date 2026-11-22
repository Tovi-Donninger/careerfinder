// Fail-closed evidence gates for the experience requirement of a vacancy.
// This is not a substitute for checking the original employer posting.
//
// Rule (see CAREERFINDER_RECRUITMENT_RULES.md):
//  - hr_recruitment (or no roleCategory): Tovi has no HR experience, so a hard
//    experience requirement (including 1 year / 1+ years required) is rejected.
//    Explicit zero-experience wording, no stated requirement, and
//    preferred/advantage/nice-to-have wording (Tovi, 2026-11-22) are a fit.
//    Unquantified "HR experience required" and junior/entry-level titles alone are not.
//  - admin_ops, sales, customer_success: zero experience OR at most 1 year required.
//    Unquantified previous/proven experience, and preferred/advantage/nice-to-have
//    wording with no hard requirement above 1 year, are a fit (Tovi, 2026-11-22).
//    Hard quantified requirements above 1 year are still rejected.
//  - Customer support maps to customer_success; data entry and back-office map to admin_ops.
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

// Admin/ops, sales and customer success (Tovi, 2026-11-19; CS added 2026-11-22):
// "previous/proven/relevant/prior experience" (or a plain role-subject phrase like
// "B2C phone sales experience", "proven track record", "customer support experience")
// with no number of years counts as a fit. A hard requirement of more than 1 year
// still fails. Preferred/optional years are ignored (see stripPreferredExperience).
// HR stays strict.
export const UNQUANTIFIED_EXPERIENCE_CATEGORIES=["admin_ops","sales","customer_success"];
export const UNQUANTIFIED_EXPERIENCE=/\b(?:(?:previous|proven|relevant|prior|sales|b2b|b2c|phone|telesales|telemarketing|office|administrative|admin|operations|client[- ]facing|customer[- ]facing|customer(?:[- ]success|[- ]support)?|support|data[- ]entry|back[- ]office)\s+(?:[a-z0-9][a-z0-9/&-]*\s+){0,3}?experience\b|proven track record\b)/i;
export function unquantifiedExperienceOk(text, roleCategory) {
  const category=normalizeRoleCategory(roleCategory);
  if(!UNQUANTIFIED_EXPERIENCE_CATEGORIES.includes(category))return false;
  const t=String(text||"");
  const sentences=t.split(/(?<=[.!?\n])\s+|\n+/).filter(x=>/experience|years?|yrs?|months?/i.test(x)).join(" . ");
  return UNQUANTIFIED_EXPERIENCE.test(t)&&!hardExperienceExceedsOneYear(sentences);
}

// Preferred / advantage / nice-to-have experience (Tovi, 2026-11-22).
// Applies to all target categories, including HR/recruitment. Combined with
// hardExperienceExceedsOneYear (non-HR) or hardHrExperienceRequired (HR).
const SOFT_EXPERIENCE_QUAL="(?:(?:an?|a)\s+)?(?:advantage|advantageous|plus|nice[- ]to[- ]have|bonus|preferred|preferably|preferable|desirable|asset|optional|ideal(?:ly)?)";
export const PREFERRED_EXPERIENCE=new RegExp("\\bexperience\\b[^.;\\n]{0,80}?(?:is |are |would be |will be |considered |[-–—:]\\s*)?(?:"+SOFT_EXPERIENCE_QUAL+")\\b|\\b(?:"+SOFT_EXPERIENCE_QUAL+")\\b[^.;\\n]{0,80}?\\bexperience\\b","i");
export const PREFERRED_YEARS=new RegExp("\\b(?:\\d+(?:\\.\\d+)?|"+WORD_RE+"|several|multiple|many|few|couple of|numerous)(?:\\s*(?:-|–|—|to)\\s*(?:\\d+(?:\\.\\d+)?|"+WORD_RE+"))?\\s*(?:\\+|plus)?\\s*(?:years?|yrs?|months?)\\b[^.;\\n]{0,60}?(?:"+SOFT_EXPERIENCE_QUAL+")|(?:"+SOFT_EXPERIENCE_QUAL+")\\b[^.;\\n]{0,60}?\\b(?:\\d+(?:\\.\\d+)?|"+WORD_RE+"|several|multiple|many)(?:\\s*(?:-|–|—|to)\\s*(?:\\d+(?:\\.\\d+)?|"+WORD_RE+"))?\\s*(?:\\+|plus)?\\s*(?:years?|yrs?|months?)\\b","i");

// Remove preferred/optional year clauses so "3 years preferred" is not treated as a hard demand.
export function stripPreferredExperience(text) {
  let t=String(text||"");
  const years="(?:\\d+(?:\\.\\d+)?|"+WORD_RE+"|several|multiple|many|few|couple of|numerous)(?:\\s*(?:-|–|—|to)\\s*(?:\\d+(?:\\.\\d+)?|"+WORD_RE+"))?\\s*(?:\\+|plus)?\\s*(?:years?|yrs?|months?)";
  const ofExp="(?:\\s+of\\s+(?:relevant |related |prior |previous |professional )?(?:experience|exp\\.?))?";
  const soft=SOFT_EXPERIENCE_QUAL;
  const leading=new RegExp("(?:,|;|\\.|\\bbut\\b|\\band\\b)?\\s*(?:is |are |would be |will be |considered )?(?:"+soft+")\\s*[:\\-–—]?\\s*(?:of )?(?:about |around |approximately )?"+years+ofExp,"gi");
  const trailing=new RegExp("\\b"+years+ofExp+"\\s*(?:is |are |would be |will be |considered )?(?:"+soft+")","gi");
  t=t.replace(leading," ");
  t=t.replace(trailing," ");
  return t.replace(/\s+/g," ").trim();
}
export function hardExperienceExceedsOneYear(text) {
  return exceedsOneYear(stripPreferredExperience(text));
}
export function preferredExperienceOk(text, roleCategory) {
  const category=normalizeRoleCategory(roleCategory);
  if(category===false)return false;
  const t=String(text||"");
  if(!PREFERRED_EXPERIENCE.test(t)&&!PREFERRED_YEARS.test(t))return false;
  const sentences=t.split(/(?<=[.!?\n])\s+|\n+/).filter(x=>/experience|years?|yrs?|months?/i.test(x)).join(" . ");
  const isHr=category===null||category==="hr_recruitment";
  return isHr?!hardHrExperienceRequired(sentences||t):!hardExperienceExceedsOneYear(sentences||t);
}

// HR only: any hard experience requirement is a reject, including 1 year / 1+ years
// required and unquantified "experience required". Preferred/advantage clauses and
// explicit zero-experience wording are not hard requirements.
export function hardHrExperienceRequired(text) {
  const t=String(text||"");
  const parts=t.split(/(?<=[.!?;])\s+|\n+/).map(s=>s.trim()).filter(Boolean);
  for(const part of parts.length?parts:[t]){
    if(!/experience|years?|yrs?|months?/i.test(part))continue;
    const stripped=stripPreferredExperience(part);
    if(EXPLICIT_ZERO.test(part)&&!exceedsOneYear(stripped))continue;
    if(PREFERRED_EXPERIENCE.test(part)||PREFERRED_YEARS.test(part))continue;
    if(exceedsOneYear(stripped)||statesAtMostOneYear(stripped))return true;
    if(/\b(?:(?:must|needs? to)\s+have|(?:is |are )?required|mandatory|necessary)\b[^.;\n]{0,80}\bexperience\b|\bexperience\b[^.;\n]{0,80}\b(?:is |are )?(?:required|mandatory|necessary|needed|a must)\b/i.test(stripped)
      &&!/\bnot (?:required|mandatory|necessary|a must)\b/i.test(stripped))return true;
  }
  return false;
}

// Role-aware gate. job: {zeroExperienceEvidence, zeroExperienceSourceUrl, roleCategory?}
export function experienceEvidence(job) {
  const category=normalizeRoleCategory(job.roleCategory);
  if(category===false)return false;
  const evidence=String(job.zeroExperienceEvidence||"").trim();
  const url=String(job.zeroExperienceSourceUrl||"").trim();
  if(!evidence||!/^https:\/\//i.test(url))return false;
  const isHr=category===null||category==="hr_recruitment";
  if(isHr){
    if(zeroExperienceEvidence(job))return true;
    if(hardHrExperienceRequired(evidence))return false;
    if(NO_STATED_EXPERIENCE.test(evidence))return noStatedExperienceEvidence(evidence);
    return preferredExperienceOk(evidence,category||"hr_recruitment");
  }
  if(NO_STATED_EXPERIENCE.test(evidence))return noStatedExperienceEvidence(evidence);
  if(hardExperienceExceedsOneYear(evidence))return false;
  return EXPLICIT_ZERO.test(evidence)||statesAtMostOneYear(evidence)||NON_HR_OPEN_EXPERIENCE.test(evidence)||unquantifiedExperienceOk(evidence,category)||preferredExperienceOk(evidence,category);
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
  if(category===null||category==="hr_recruitment"){
    if(hardHrExperienceRequired(text))return false;
    return EXPLICIT_ZERO.test(text)||preferredExperienceOk(text,category||"hr_recruitment");
  }
  const sentences=text.split(/(?<=[.!?\n])\s+|\n+/).filter(s=>/experience|years?|months?/i.test(s)).join(" . ");
  if(hardExperienceExceedsOneYear(sentences))return false;
  return EXPLICIT_ZERO.test(text)||statesAtMostOneYear(sentences)||NON_HR_OPEN_EXPERIENCE.test(text)||unquantifiedExperienceOk(text,category)||preferredExperienceOk(text,category);
}
