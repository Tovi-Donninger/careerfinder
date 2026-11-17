// Local Playwright employer-form executor. Never run on LinkedIn or Indeed.
// Requires explicit --submit approval; does not bypass access controls or CAPTCHA.
// npm install --no-save playwright && npx playwright install chromium
import { chromium } from "playwright";
import { readFile, writeFile, mkdir, open } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

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
 ? await chromium.connectOverCDP((process.env.BROWSERLESS_WS_ENDPOINT||"wss://production-ams.browserless.io").replace(/\\/$/,"")+"?token="+encodeURIComponent(token))
 : await chromium.launch({headless:!args.includes("--visible")});

const page=await browser.newPage({acceptDownloads:false});
const receipt={id:randomUUID(),jobUrl:url.href,jobTitle:job.title||"",company:job.company||"",status:"Needs review",submitted:false,at:new Date().toISOString(),confirmation:""};
const fill=async(selectors,value)=>{if(!value)return false;for(const selector of selectors){const loc=page.locator(selector).first();if(await loc.count()&&await loc.isVisible()&&await loc.isEnabled()){await loc.fill(String(value));return true}}return false};
try{
 await page.goto(url.href,{waitUntil:"domcontentloaded",timeout:45000});
 if(new URL(page.url()).hostname!==url.hostname)throw Error("Redirected to a different domain; verify employer application page before continuing");
 const text=(await page.locator("body").innerText()).slice(0,25000);
 if(/captcha|verify you are human|cloudflare challenge|security check/i.test(text))throw Error("Human verification required");
 if(/no longer accepting applications|position has been filled|job is closed|applications are closed/i.test(text))throw Error("Vacancy is closed");
 await fill(['input[autocomplete="given-name"]','input[name="first_name"]','input[name="firstName"]','input[id*="first_name"]'],profile.firstName);
 await fill(['input[autocomplete="family-name"]','input[name="last_name"]','input[name="lastName"]','input[id*="last_name"]'],profile.lastName);
 await fill(['input[autocomplete="email"]','input[type="email"]','input[name="email"]'],profile.email);
 await fill(['input[autocomplete="tel"]','input[type="tel"]','input[name="phone"]'],profile.phone);
 await fill(['input[name*="linkedin" i]','input[id*="linkedin" i]'],profile.linkedin);
 const cvPath=application.cvFile?resolve(application.cvFile):"";
 if(cvPath){const input=page.locator('input[type="file"]').first();if(await input.count())await input.setInputFiles(cvPath)}
 // Never invent answers to screening, work authorization, compensation or consent questions.
 const required=await page.locator('input[required],select[required],textarea[required]').evaluateAll(nodes=>nodes.filter(el=>!el.disabled&&!el.value&&!["hidden","submit","checkbox","radio","file"].includes(el.type)).map(el=>el.name||el.id||"unnamed required field"));
 if(required.length)throw Error("Required questions need review: "+required.slice(0,12).join(", "));
 const unchecked=await page.locator('input[type="checkbox"][required],input[type="radio"][required]').evaluateAll(nodes=>nodes.filter(el=>!el.checked).map(el=>el.name||el.id||"required selection"));
 if(unchecked.length)throw Error("Required selections or consent need review: "+unchecked.slice(0,12).join(", "));
 if(!submit){receipt.status="Prepared";receipt.reason="Form prepared for review; rerun with --submit after inspecting it";}
 if(submit){
 const buttons=page.getByRole("button",{name:/^(submit application|send application|apply now|submit)$/i});
 if(await buttons.count()!==1)throw Error("Unambiguous submission button not found");
 if(!args.includes("--confirm-authorized"))throw Error("Submission requires --submit --confirm-authorized (explicit permission for this employer application)");
 await buttons.click({timeout:12000});
 await page.waitForLoadState("domcontentloaded",{timeout:15000}).catch(()=>{});
 const after=(await page.locator("body").innerText()).slice(0,25000);
 const match=after.match(/(?:thank you for applying|application (?:has been |was )?submitted|application received|we (?:have )?received your application|successfully applied)/i);
 if(!match)throw Error("Submission clicked but no employer confirmation found; do not retry until checked for duplicates");
 receipt.submitted=true;receipt.status="Submitted";receipt.confirmation=match[0];receipt.confirmationPage=page.url();
 }
} catch(error){receipt.reason=error.message; if(receipt.status!=="Prepared")receipt.status="Needs review"}
finally{
 await mkdir("application-receipts",{recursive:true});
 await page.screenshot({path:"application-receipts/"+receipt.id+".png",fullPage:true}).catch(()=>{});
 await writeFile("application-receipts/"+receipt.id+".json",JSON.stringify(receipt,null,2),{mode:0o600});
 await browser.close();
 console.log(JSON.stringify(receipt,null,2));
 if(!receipt.submitted)process.exitCode=submit?1:0;
}
