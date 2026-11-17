// Provider routing for public job-board discovery and employer ATS application pages.
// LinkedIn and Indeed require user-authorized application workflows; do not automate their forms.
export function routeApplication(url) {
  let u;try{u=new URL(url)}catch{return {channel:"unsupported",supported:false,reason:"Invalid vacancy URL"}}
  if(u.protocol!=="https:")return {channel:"unsupported",supported:false,reason:"HTTPS vacancy URL required"};
  const host=u.hostname.toLowerCase();
  if(/(^|\.)linkedin\.com$/.test(host))return {channel:"linkedin",supported:false,reason:"LinkedIn application requires a permitted user-authorized integration or manual completion"};
  if(/(^|\.)indeed\.(com|co\.[a-z]{2})$/.test(host))return {channel:"indeed",supported:false,reason:"Indeed application requires a permitted user-authorized integration or manual completion"};
  if(/(^|\.)(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com|workable\.com|bamboohr\.com|personio\.com|teamtailor\.com)$/.test(host))return {channel:"employer-ats",supported:false,reason:"Employer ATS API credentials or approved submission integration required"};
  return {channel:"employer-website",supported:false,reason:"Employer website submission method not verified"};
}
