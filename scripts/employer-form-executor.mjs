// Local Playwright employer-form executor. Never run on LinkedIn or Indeed.
// Requires explicit --submit approval; does not bypass access controls or CAPTCHA.
// npm install --no-save playwright && npx playwright install chromium
import { chromium } from "playwright-core";
import { readFile, writeFile, mkdir, open } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { inspectVacancy } from "./vacancy-verification.mjs";
import { digitsOnlyPhone, phoneFieldNeedsDigits, pickSubmitButton } from "./form-helpers.mjs";
import { detectAdapter, leverUrls, isComeetApplyFrame, toE164, CONFIRMATION, confirmationHostOk } from "./form-adapters.mjs";
import { buildAnswerBook, answerQuestion } from "./screening-answers.mjs";

const args=process.argv.slice(2);
const value=flag=>{const i=args.indexOf(flag);return i>=0?args[i+1]:undefined};
const file=value("--application");
if(!file)throw Error("Usage: node scripts/employer-form-executor.mjs --application private-application.json [--submit]");
const application=JSON.parse(await readFile(resolve(file),"utf8"));
const {job,profile}=application;
if(!job?.url||!profile?.firstName||!profile?.lastName||!profile?.email)throw Error("Missing employer vacancy URL or candidate identity");
const url=new URL(job.url);
if(url.protocol!=="https:")throw Error("HTTPS employer vacancy URL required");
if(/(^|\.)(linkedin\.com|indeed\.com|indeed\.co\.[a-z]{2})$/i.test(url.hostname))throw Error("Use the employer's official application page, not LinkedIn/Indeed");
if(!application.verifiedZeroExperience||!application.verifiedEnglish||!application.verifiedIsraelEligibility||!application.confirmedOpen)throw Error("Mandatory vacancy eligibility checks have not been independently verified");
const submit=args.includes("--submit");
// Conservative local unit reservation; counts attempted sessions, not provider-billed usage.
const token=process.env.BROWSERLESS_TOKEN;
const monthlyCap=Number(process.env.CAREERFINDER_BROWSER_MONTHLY_UNIT_CAP||900);
const perSessionReserve=Number(process.env.CAREERFINDER_BROWSER_RESERVE_UNITS||4);
if(!Number.isSafeInteger(monthlyCap)||monthlyCap<1||!Number.isSafeInteger(perSessionReserve)||perSessionReserve<1)throw Error("Invalid browser budget configuration");
const month=new Date().toISOString().slice(0,7);
if(token)await mkdir(".careerfinder-private",{recursive:true});
const budgetPath=".careerfinder-private/browser-budget-"+month+".json";
const lockPath=".careerfinder-private/browser-budget-"+month+".lock";
if(token){
let lock;
try{lock=await open(lockPath,"wx",0o600)}catch{throw Error("Browser budget lock is busy; do not start parallel sessions")}
let spent=0;
try{
 try{const prior=JSON.parse(await readFile(budgetPath,"utf8"));spent=Number(prior.reservedUnits)||0}catch{}
 if(spent+perSessionReserve>monthlyCap)throw Error("Monthly browser budget exhausted; queued applications must wait");
 await writeFile(budgetPath,JSON.stringify({month,reservedUnits:spent+perSessionReserve,cap:monthlyCap,updatedAt:new Date().toISOString()}),{mode:0o600});
}finally{await lock.close();await (await import("node:fs/promises")).unlink(lockPath).catch(()=>{})}
}
const browser=token
 ? await chromium.connectOverCDP((() => {
    const endpoint=new URL(process.env.BROWSERLESS_WS_ENDPOINT||"wss://production-ams.browserless.io");
    if(endpoint.protocol!=="wss:"||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error("Invalid Browserless endpoint");
    endpoint.searchParams.set("token",token);
    return endpoint.toString();
   })())
 : await chromium.launch({headless:!args.includes("--visible"),executablePath:process.env.CAREERFINDER_CHROME_PATH||undefined});

const page=await browser.newPage({acceptDownloads:false});
const receipt={id:randomUUID(),jobUrl:url.href,jobTitle:job.title||"",company:job.company||"",status:"Needs review",submitted:false,at:new Date().toISOString(),confirmation:"",reason:"Application session started; manual verification may be required"};
const adapter=detectAdapter(url.href);
receipt.adapter=adapter;
const book=buildAnswerBook(profile);
let root=page; // the Page or Frame that holds the application form
const visible=async loc=>(await loc.count())&&await loc.first().isVisible().catch(()=>false)&&await loc.first().isEnabled().catch(()=>false);
const fill=async(selectors,value)=>{if(!value)return false;for(const selector of selectors){const loc=root.locator(selector).first();if(await visible(loc)){await loc.fill(String(value));return true}}return false};
// A visible human-verification challenge (not an invisible reCAPTCHA/hCaptcha badge) stops the run.
const challengeVisible=async()=>{
 for(const f of page.frames()){
  const u=f.url();
  if(!/recaptcha\/api2\/bframe|recaptcha\/enterprise\/bframe|hcaptcha\.com\/.*(?:challenge|frame=challenge)|challenges\.cloudflare\.com/.test(u))continue;
  const el=await f.frameElement().catch(()=>null);
  if(el&&await el.isVisible().catch(()=>false)){const box=await el.boundingBox().catch(()=>null);if(box&&box.width>100&&box.height>100)return true}
 }
 return false;
};
try{
 const lever=adapter==="lever"?leverUrls(url.href):null;
 if(adapter==="lever"&&!lever)throw Error("Unrecognised Lever posting URL");
 await page.goto(lever?lever.posting:url.href,{waitUntil:"domcontentloaded",timeout:45000});
 if(new URL(page.url()).hostname!==url.hostname)throw Error("Redirected to a different domain; verify employer application page before continuing");
 await page.waitForTimeout(adapter==="comeet"?3000:1000);
 const text=(await page.locator("body").innerText()).slice(0,25000);
 if(/verify you are human|cloudflare challenge|are you a robot/i.test(text)||await challengeVisible())throw Error("Human verification required");
 if(/no longer accepting applications|position has been filled|job is closed|applications are closed/i.test(text))throw Error("Vacancy is closed");
 const inspection=inspectVacancy({pageText:text,title:job.title,company:job.company,sourceEvidence:application.sourceEvidence});
 if(!inspection.verified)throw Error("Employer vacancy verification requires review: "+inspection.failures.join("; "));
 // Open the adapter's application form.
 if(adapter==="lever"){
  await page.goto(lever.apply,{waitUntil:"domcontentloaded",timeout:45000});
  await page.locator('form#application-form, form[enctype="multipart/form-data"]').first().waitFor({timeout:20000});
 }
 if(adapter==="comeet"){
  const open=page.locator('[data-qa="applyButton"]').first();
  if(await visible(open))await open.click({timeout:10000}).catch(()=>{});
  let frame=null;
  for(let i=0;i<40&&!frame;i++){frame=page.frames().find(f=>isComeetApplyFrame(f.url()))||null;if(!frame)await page.waitForTimeout(500)}
  if(frame){root=frame;await frame.locator('#inputFirstName, input[name="firstName"]').first().waitFor({timeout:20000})}
  else if(!(await page.locator('input[name="firstName"]').count()))throw Error("Comeet application form did not load");
 }
 // CV first: Lever parses the CV and may overwrite fields, so identity is filled afterwards.
 const cvPath=application.cvFile?resolve(application.cvFile):"";
 if(cvPath){
  let input=null;
  for(const sel of ['input[type="file"][name="resume"]','input[type="file"]#cv','input[type="file"][name="cv"]','input[type="file"][name*="resume" i]','input[type="file"][id*="resume" i]','input[type="file"]']){const l=root.locator(sel).first();if(await l.count()){input=l;break}}
  if(input){await input.setInputFiles(cvPath);await page.waitForTimeout(adapter==="lever"?4000:1500)}
 }
 if(adapter==="lever")await fill(['input[name="name"]'],(profile.firstName+" "+profile.lastName).trim());
 await fill(['input[autocomplete="given-name"]','input[name="first_name"]','input[name="firstName"]','input#inputFirstName','input[id*="first_name"]'],profile.firstName);
 await fill(['input[autocomplete="family-name"]','input[name="last_name"]','input[name="lastName"]','input#inputLastName','input[id*="last_name"]'],profile.lastName);
 await fill(['input[autocomplete="email"]','input[type="email"]','input[name="email"]'],profile.email);
 // Phone: an intl-tel-input widget (Comeet) gets the E.164 number through its own API, which also
 // selects the country; other fields use digits only when they are numeric or reject "+"/spaces.
 if(profile.phone){
  for(const selector of ['input[autocomplete="tel"]','input[type="tel"]','input[name="phone"]','input[name*="phone" i]']){
   const loc=root.locator(selector).first();
   if(!(await visible(loc)))continue;
   const e164=toE164(profile.phone,profile.country||"Israel");
   const iti=e164?await loc.evaluate((el,num)=>{const g=window.intlTelInput||window.intlTelInputGlobals;const i=g&&g.getInstance&&g.getInstance(el);if(!i)return null;i.setNumber(num);for(const t of ["input","change","blur"])el.dispatchEvent(new Event(t,{bubbles:true}));return {valid:i.isValidNumber?i.isValidNumber():!!el.value}},e164).catch(()=>null):null;
   if(iti){if(!iti.valid)throw Error("Phone number was not accepted by the employer form; check the profile phone");break}
   const attrs=await loc.evaluate(el=>({type:el.type,pattern:el.getAttribute("pattern")||"",inputMode:el.inputMode||""}));
   const digits=digitsOnlyPhone(profile.phone);
   if(phoneFieldNeedsDigits(attrs))await loc.fill(digits);
   else{
    try{await loc.fill(String(profile.phone))}catch{await loc.fill(digits)}
    const ok=await loc.evaluate(el=>!!el.value&&el.checkValidity());
    if(!ok)await loc.fill(digits);
   }
   break;
  }
 }
 await fill(['input[name*="linkedin" i]','input[id*="linkedin" i]','input[name="urls[LinkedIn]"]'],profile.linkedin);
 // Lever "Current location" is an autocomplete: type the city and take the first suggestion.
 if(adapter==="lever"){
  const loc=root.locator('input[name="location"]').first();
  if(await visible(loc)&&!(await loc.inputValue())){
   await loc.fill(book.location);await page.waitForTimeout(1500);
   const sug=root.locator('.dropdown-location, .dropdown-results > div, [class*="dropdown"] li').first();
   if(await visible(sug))await sug.click().catch(()=>{});
  }
 }
 // Custom questions: answer only from the saved profile (screening-answers.mjs). Anything
 // else that is required stops the run. Never infer consent, demographics or experience.
 const questions=await root.locator('input:not([type="hidden"]):not([type="file"]):not([type="submit"]):not([type="button"]),select,textarea').evaluateAll(nodes=>{
  const out=[],seen=new Set();
  const textOf=n=>(n?.innerText||n?.textContent||"").replace(/\s+/g," ").trim();
  for(const el of nodes){
   if(el.disabled||!(el.offsetWidth||el.offsetHeight||el.getClientRects().length))continue;
   const key=(el.type==="radio"||el.type==="checkbox")?(el.name||el.id):(el.name||el.id);
   if(!key||seen.has(key))continue;
   const block=el.closest('.application-question,.field,.form-group,.form-field,fieldset,li,[role="group"],.question');
   let label=(el.labels&&el.labels[0]&&(el.type!=="radio"&&el.type!=="checkbox")?textOf(el.labels[0]):"")||el.getAttribute("aria-label")||"";
   if(!label&&block){const l=block.querySelector('legend,.application-label,label,.text,.question-label');label=textOf(l)}
   const group=(el.type==="radio"||el.type==="checkbox")&&el.name?[...document.getElementsByName(el.name)]:[el];
   const required=el.required||el.getAttribute("aria-required")==="true"||group.some(g=>g.required)||/[*✱]\s*$/.test(label);
   const filled=el.type==="radio"||el.type==="checkbox"?group.some(g=>g.checked):!!String(el.value||"").trim();
   seen.add(key);
   if(filled)continue;
   const options=el.tagName==="SELECT"?[...el.options].map(o=>textOf(o)):(el.type==="radio"?group.map(g=>textOf(g.labels&&g.labels[0])||g.value):[]);
   const kind=el.tagName==="SELECT"?"select":el.tagName==="TEXTAREA"?"textarea":el.type==="radio"?"radio":el.type==="checkbox"?"checkbox":el.type==="number"?"number":"text";
   out.push({key,label:label.replace(/[*✱]\s*$/,"").trim(),required,kind,options});
  }
  return out;
 });
 const unknown=[],answered=[];
 for(const q of questions){
  if(!q.required)continue; // optional questions stay blank
  const ans=answerQuestion(q.label,{kind:q.kind,options:q.options},book);
  if(!ans){unknown.push(q.label||q.key);continue}
  const byName=root.locator('[name="'+q.key.replace(/"/g,'\\"')+'"]');
  const target=(await byName.count())?byName:root.locator('#'+q.key.replace(/[^a-zA-Z0-9_-]/g,""));
  if(q.kind==="select")await target.first().selectOption({label:ans.option});
  else if(q.kind==="radio"){
   const n=await target.count();let done=false;
   for(let i=0;i<n&&!done;i++){const r=target.nth(i);const t=await r.evaluate(el=>((el.labels&&el.labels[0]&&el.labels[0].innerText)||el.value||"").replace(/\s+/g," ").trim());if(t===ans.option){await r.check();done=true}}
   if(!done){unknown.push(q.label||q.key);continue}
  }
  else await target.first().fill(String(ans.value));
  answered.push(q.label||q.key);
 }
 receipt.answeredQuestions=answered.slice(0,20);
 if(unknown.length)throw Error("Required questions need review: "+unknown.slice(0,12).join(" | "));
 const required=await root.locator('input[required],select[required],textarea[required]').evaluateAll(nodes=>nodes.filter(el=>!el.disabled&&!el.value&&!["hidden","submit","checkbox","radio"].includes(el.type)).map(el=>el.name||el.id||"unnamed required field"));
 if(required.length)throw Error("Required questions need review: "+required.slice(0,12).join(", "));
 // Group required radio buttons by question; one selected option satisfies the group.
 // Never infer consent, work authorization, sponsorship or demographic answers.
 const unchecked=await root.locator('input[type="checkbox"][required],input[type="radio"][required]').evaluateAll(nodes=>{
   const missing=[],radios=new Map();
   for(const el of nodes){
     if(el.disabled)continue;
     if(el.type==="checkbox"&&!el.checked)missing.push(el.name||el.id||"required consent");
     if(el.type==="radio"){const key=el.name||el.id||"unnamed radio group";const group=radios.get(key)||[];group.push(el);radios.set(key,group)}
   }
   for(const [key,group] of radios)if(!group.some(el=>el.checked))missing.push(key);
   return missing;
 });
 if(unchecked.length)throw Error("Required selections or consent need review: "+unchecked.slice(0,12).join(", "));
 if(await challengeVisible())throw Error("Human verification required");
 if(!submit){receipt.status="Prepared";receipt.reason="Form prepared for review ("+adapter+" adapter); rerun with --submit after inspecting it";}
 if(submit){
 // Only a button inside the application form (the form holding the CV upload or email
 // field) counts, so a job-page "Apply" link that just opens the form is never treated
 // as the final submission. Lever's submit button is its documented data-qa="btn-submit".
 let button=null;
 if(adapter==="lever"){
  const b=root.locator('[data-qa="btn-submit"], #btn-submit').first();
  if(await visible(b)&&pickSubmitButton([{index:0,visible:true,label:(await b.innerText()).trim()}]))button=b;
 }else{
  const form=root.locator('form:has(input[type="file"]), form:has(input[type="email"])').first();
  if(!(await form.count()))throw Error("Application form not found on the employer page");
  const candidates=form.locator('button, input[type="submit"]');
  const found=[];
  for(let i=0;i<await candidates.count();i++){const el=candidates.nth(i);found.push({index:i,visible:await el.isVisible(),label:(await el.evaluate(n=>n.tagName==="INPUT"?n.value:(n.innerText||n.getAttribute("aria-label")||""))).trim()})}
  const chosen=pickSubmitButton(found);
  if(chosen)button=candidates.nth(chosen.index);
 }
 if(!button)throw Error("Unambiguous submission button not found in the application form");
 if(!args.includes("--confirm-authorized"))throw Error("Submission requires --submit --confirm-authorized (explicit permission for this employer application)");
 receipt.reason="Submission button clicked; awaiting employer confirmation. Do not retry automatically.";
 await button.click({timeout:12000});
 // Wait for the employer's confirmation in the page or the form frame (SPA forms do not navigate).
 let match=null,where=page.url();
 for(let i=0;i<40&&!match;i++){
  await page.waitForTimeout(750);
  for(const f of [page.mainFrame(),...(root!==page?[root]:[])]){
   const t=await f.locator("body").innerText({timeout:3000}).catch(()=>"");
   const m=t.slice(0,25000).match(CONFIRMATION);
   if(m){match=m;where=page.url();break}
  }
  if(!match&&i>8&&await challengeVisible())throw Error("Human verification appeared after submitting; check the application manually before retrying");
 }
 if(!match)throw Error("Submission clicked but no employer confirmation found; do not retry until checked for duplicates");
 if(!confirmationHostOk(where,url.href))throw Error("Confirmation page is not on the employer or its applicant-tracking site; check manually");
 receipt.submitted=true;receipt.status="Submitted";receipt.reason="Employer confirmation captured on the employer's application page";receipt.confirmation=match[0];receipt.confirmationPage=where;
 }
} catch(error){receipt.reason=error.message; if(receipt.status!=="Prepared")receipt.status="Needs review"}
finally{
 await mkdir("application-receipts",{recursive:true});
 await page.screenshot({path:"application-receipts/"+receipt.id+".png",fullPage:true}).catch(()=>{});
 await writeFile("application-receipts/"+receipt.id+".json",JSON.stringify(receipt,null,2),{mode:0o600});
 await browser.close();
 console.log(JSON.stringify({...receipt,answeredQuestions:receipt.answeredQuestions?.length||0},null,2));
 if(!receipt.submitted)process.exitCode=submit?1:0;
}
