// Screening-question answers built only from Tovi's saved CareerFinder profile.
// Pure module (unit tested). Anything not covered here returns null and the runner
// stops for review: no guessing of experience, demographics, consent or legal statements.

// Standard answers Tovi confirmed (2026-11-18/19). Profile fields and the profile notes
// override these; English/Hebrew levels can be overridden in notes, e.g. "Hebrew: fluent".
const DEFAULTS={englishLevel:"Native (mother tongue)",hebrewLevel:"Basic",city:"Herzliya",country:"Israel"};

export function buildAnswerBook(profile={}){
  const notes=String(profile.notes||"");
  const book={...DEFAULTS};
  if(profile.city)book.city=String(profile.city).trim();
  if(profile.country)book.country=String(profile.country).trim();
  book.location=book.city+", "+book.country;
  book.linkedin=String(profile.linkedin||"").trim();
  // Salary: notes win ("Expected salary 3,000 USD/month"), then minimumSalary (USD/month).
  const sal=notes.match(/salary[^.\d]{0,30}([\d][\d,.]*)\s*(usd|\$|nis|ils|₪|eur|€)?\s*(?:\/|per\s+|a\s+)?\s*(month|year|hour)?/i);
  const amount=sal?sal[1].replace(/[,]/g,""):String(profile.minimumSalary||"").replace(/[^\d.]/g,"");
  if(amount){
    const cur=sal&&sal[2]?({"$":"USD","₪":"ILS","nis":"ILS","€":"EUR"}[sal[2].toLowerCase()]||sal[2].toUpperCase()):"USD";
    const per=sal&&sal[3]?sal[3].toLowerCase():"month";
    book.salaryNumber=amount;
    book.salaryText=Number(amount).toLocaleString("en-US")+" "+cur+" per "+per;
  }
  book.israeliCitizen=/israeli citizen/i.test(notes);
  book.needsSponsorship=/no sponsorship|without sponsorship|sponsorship (?:is )?not (?:needed|required)/i.test(notes)?false:(book.israeliCitizen?false:null);
  book.startImmediately=/start immediately|immediately available|available immediately/i.test(notes);
  book.usHoursOk=/us hours[^.]{0,40}\b(?:fine|ok|okay)\b|\b(?:fine|ok|okay) (?:with|working) us hours/i.test(notes);
  book.officeDaysOk=/(?:5|five) office days[^.]{0,20}\b(?:fine|ok|okay)\b|us hours and (?:5|five) office days are fine/i.test(notes);
  const eng=notes.match(/english\s*[:\-]\s*([a-z ()]+?)(?:[.;,]|$)/i);if(eng)book.englishLevel=eng[1].trim();
  const heb=notes.match(/hebrew\s*[:\-]\s*([a-z ()]+?)(?:[.;,]|$)/i);if(heb)book.hebrewLevel=heb[1].trim();
  return book;
}

const norm=s=>String(s||"").replace(/\s+/g," ").trim();
const YES=/^\s*(?:yes|y|true|i am|i do|i can)\b/i, NO=/^\s*(?:no|n|false|i am not|i do not|i don't|i cannot)\b/i;
function pickOption(options,tests){
  for(const t of tests){const hit=options.find(o=>t.test(norm(o)));if(hit!==undefined)return hit}
  return null;
}
function yesNo(options,yes){
  if(!options?.length)return {value:yes?"Yes":"No"};
  const o=pickOption(options,[yes?YES:NO]);return o===null?null:{option:o};
}

// question: label text. field: {kind:"text"|"textarea"|"number"|"select"|"radio"|"checkbox", options?:string[]}
// Returns {value} for typed fields, {option} for choice fields, or null when unknown.
export function answerQuestion(label,field={},book){
  const q=norm(label).toLowerCase();
  const kind=field.kind||"text";
  const options=(field.options||[]).map(norm).filter(o=>o&&!/^(?:select|choose|please select|--)/i.test(o));
  const choice=["select","radio"].includes(kind);
  if(!q)return null;
  // Never answered automatically.
  if(/gender|race|ethnic|veteran|disab|pronoun|religio|sexual|date of birth|\bage\b|marital|criminal|convict|password|social security|id number|passport number|signature/.test(q))return null;
  if(kind==="checkbox")return null; // consents and acknowledgements stay with Tovi
  if(/years? of (?:relevant |professional |work )?experience|how many years|how much experience/.test(q))return null;
  // Sponsorship / work authorisation.
  if(/sponsor/.test(q)){if(book.needsSponsorship===null||book.needsSponsorship===undefined)return null;return yesNo(options,book.needsSponsorship)}
  if(/(?:authori[sz]ed|eligible|legally (?:allowed|able|entitled)|right|permit(?:ted)?|work permit|visa).{0,40}(?:work|employ).{0,30}israel|(?:work|employ).{0,30}israel.{0,40}(?:authori[sz]ed|eligible|legally|permit)|israeli citizen|citizenship/.test(q)){
    if(!book.israeliCitizen)return null;
    if(/citizenship/.test(q)&&!choice)return {value:"Israeli"};
    if(/citizenship/.test(q)&&choice){const o=pickOption(options,[/israel/i,YES]);return o===null?null:{option:o}}
    return yesNo(options,true);
  }
  // Start date / notice period.
  if(/notice period|when can you start|start date|earliest (?:start|date)|availability to start|available to start|how soon/.test(q)){
    if(!book.startImmediately)return null;
    if(choice){const o=pickOption(options,[/immediate|asap|right away|now/i,/^0\b|none|no notice/i,/less than (?:2|two) weeks|1 week|2 weeks/i]);return o===null?null:{option:o}}
    if(kind==="number")return {value:"0"};
    return {value:"Immediately"};
  }
  if(/can you start immediately|available immediately/.test(q)&&book.startImmediately)return yesNo(options,true);
  // Salary expectations.
  if(/salary|compensation|pay expectation|expected (?:pay|gross)|desired pay|wage/.test(q)){
    if(!book.salaryText)return null;
    if(choice)return null; // brackets in other currencies would need judgement
    if(kind==="number")return {value:book.salaryNumber};
    return {value:book.salaryText};
  }
  // Working hours / office days.
  if(/us hours|u\.s\. hours|us time ?zone|evening|night shift|late hours|american hours|est hours|pst hours/.test(q)){
    if(/evening|night|late/.test(q)&&!/us|u\.s\.|american|est|pst/.test(q))return null; // generic evening shifts: Tovi decides
    if(!book.usHoursOk)return null;return yesNo(options,true);
  }
  if(/(?:5|five) days (?:a|per) week|from the office|on[- ]?site|in[- ]office|office days|work from our office|hybrid/.test(q)&&/(?:willing|able|ok|okay|comfortable|agree|can you|are you)/.test(q)){
    if(!book.officeDaysOk)return null;return yesNo(options,true);
  }
  // Languages.
  if(/english/.test(q)&&/level|proficien|fluen|speak|native|mother tongue|rate/.test(q)){
    if(choice){const o=pickOption(options,[/native|mother tongue/i,/fluent|full professional|excellent|c2/i,YES]);return o===null?null:{option:o}}
    if(/do you speak|are you fluent|native|mother tongue/.test(q)&&options.length===0&&/\?$/.test(norm(label)))return {value:"Yes, English is my mother tongue"};
    return {value:book.englishLevel};
  }
  if(/hebrew/.test(q)&&/level|proficien|fluen|speak|native|mother tongue|rate|read|write/.test(q)){
    const basic=/basic|beginner|elementary|limited|a1|a2/i;
    if(choice){
      if(basic.test(book.hebrewLevel)){const o=pickOption(options,[basic,/^no\b/i]);return o===null?null:{option:o}}
      return null;
    }
    if(/^(?:do|are|can) you/.test(q)&&basic.test(book.hebrewLevel))return {value:"Basic Hebrew only"};
    return {value:book.hebrewLevel};
  }
  // Location.
  if(/where (?:do you|are you) (?:live|located|based)|current (?:city|location)|city of residence|place of residence|your location|^location$|^city$|which city/.test(q)){
    if(choice){const o=pickOption(options,[new RegExp(book.city,"i"),/central|center|sharon|tel aviv area/i]);return o===null?null:{option:o}}
    return {value:/city/.test(q)?book.city:book.location};
  }
  if(/^country|country of residence|which country/.test(q)){
    if(choice){const o=pickOption(options,[new RegExp("^"+book.country+"$","i")]);return o===null?null:{option:o}}
    return {value:book.country};
  }
  if(/based in israel|live in israel|reside in israel|located in israel/.test(q)&&/israel/i.test(book.country))return yesNo(options,true);
  if(/linkedin/.test(q)&&book.linkedin&&!choice)return {value:book.linkedin};
  return null;
}
