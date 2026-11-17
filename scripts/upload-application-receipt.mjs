// Synchronize Browserless outcome to the private morning review queue.
import {readFile} from "node:fs/promises";
const path=process.argv[2],jobId=process.argv[3];
const key=process.env.CAREERFINDER_AUTOMATION_KEY;
const token=process.env.CAREERFINDER_SESSION_TOKEN;
if(!path||!jobId||(!key&&!token))throw Error("Receipt path, job ID and private credential required");
const receipt=JSON.parse(await readFile(path,"utf8"));
const body={jobId,id:receipt.id,jobUrl:receipt.jobUrl,status:receipt.status,reason:receipt.reason||"",confirmation:receipt.confirmation||"",confirmationPage:receipt.confirmationPage||""};
const response=await fetch("https://careerfinder-search.tovidonninger.workers.dev/api/private/recruitment/application-executor/receipt",{method:"POST",headers:{...(key?{"X-CareerFinder-Automation-Key":key}:{"Authorization":"Bearer "+token}),"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
if(!response.ok)throw Error("Receipt upload failed (HTTP "+response.status+"); verify Worker deployment and queue enrollment");
console.log("Browser outcome recorded for review; a submitted receipt is not yet independently verified.");
