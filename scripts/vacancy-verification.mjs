import { pageExperienceOk } from "../zero-experience.js";
// Conservative public job-page checks. No claims of eligibility from a feed alone.
// Used before form completion; ambiguous requirements always require human review.
export function inspectVacancy({pageText,title,company,sourceEvidence={}}){
  const roleCategory=sourceEvidence?.roleCategory;
  const text=String(pageText||"").replace(/\s+/g," ").slice(0,60000);
  const failures=[];
  if(text.length<150)failures.push("Vacancy page has insufficient readable content");
  if(/no longer accepting applications|position has been filled|job is closed|applications are closed|job posting has expired|this job is no longer available/i.test(text))failures.push("Employer indicates the vacancy is closed");
  const words=s=>String(s||"").toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(x=>x.length>3);
  const titleWords=words(title);
  if(!titleWords.length||titleWords.filter(w=>text.toLowerCase().includes(w)).length<Math.min(2,titleWords.length))failures.push("Vacancy title could not be matched to the employer page");
  const companyWords=words(company);
  if(companyWords.length&&!companyWords.some(w=>text.toLowerCase().includes(w)))failures.push("Employer name could not be matched to the vacancy page");
  if(roleCategory&&roleCategory!=="hr_recruitment"){if(!pageExperienceOk(text,roleCategory))failures.push("Employer page does not confirm an experience requirement of at most 1 year for this role category")}
  else if(!/(?:no (?:prior |previous |professional )?experience (?:required|necessary|needed)|(?:entry.level|junior).{0,80}(?:no experience|training provided)|(?:experience (?:is )?not required))/i.test(text))failures.push("Employer page does not explicitly confirm no prior experience is required");
  if(/(?:fluent|proficient|native|mandatory|required|must speak).{0,50}(?:hebrew|arabic|russian|french|german|spanish)|(?:hebrew|arabic|russian|french|german|spanish).{0,50}(?:required|mandatory|fluent|proficient)/i.test(text))failures.push("Possible additional language requirement");
  if(/(?:must be based in|residents only|only candidates (?:from|in)).{0,50}(?:usa|united states|uk|united kingdom|europe|eu|canada)/i.test(text))failures.push("Possible location restriction");
  if(!sourceEvidence?.language||!/\benglish\b/i.test(sourceEvidence.language)||/not confirmed|unclear|verify/i.test(sourceEvidence.language))failures.push("English-language eligibility has not been independently verified");
  if(!sourceEvidence?.eligibility||!/\bisrael\b/i.test(sourceEvidence.eligibility)||/not confirmed|unclear|verify/i.test(sourceEvidence.eligibility))failures.push("Israel work eligibility has not been independently verified");
  return {verified:failures.length===0,failures};
}
