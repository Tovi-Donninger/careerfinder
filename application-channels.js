// Provider routing for public job-board discovery and employer ATS application pages.
// LinkedIn and Indeed require user-authorized application workflows; do not automate their forms.
export function routeApplication(url) {
  let u;try{u=new URL(url)}catch{return {channel:"unsupported",supported:false,reason:"Invalid vacancy URL"}}
  if(u.protocol!=="https:")return {channel:"unsupported",supported:false,reason:"HTTPS vacancy URL required"};
  const host=u.hostname.toLowerCase();
  if(/(^|\.)linkedin\.com$/.test(host))return {channel:"linkedin",supported:false,fallback:"employer-website",reason:"LinkedIn submission unavailable: locate and verify the identical vacancy on the employer career site"};
  if(/(^|\.)indeed\.(com|co\.[a-z]{2})$/.test(host))return {channel:"indeed",supported:false,fallback:"employer-website",reason:"Indeed submission unavailable: locate and verify the identical vacancy on the employer career site"};
  if(/(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com|bamboohr\.com|personio\.com|teamtailor\.com|myworkdayjobs\.com|workdayjobs\.com|icims\.com|jobvite\.com|recruitee\.com|applytojob\.com|ultipro\.com|successfactors\.com)$/.test(host))return {channel:"employer-ats",supported:false,fallback:"authorized-browser-workflow",reason:"Use employer-approved ATS integration or permitted browser form completion"};
  return {channel:"employer-website",supported:false,fallback:"authorized-browser-workflow",reason:"Employer application form requires permitted browser completion and verified receipt"};
}
