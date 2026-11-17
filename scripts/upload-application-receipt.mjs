// Upload a local browser receipt to the private review queue.
// A receipt is never equivalent to a verified submission.
import {readFile} from "node:fs/promises";
const path=process.argv[2],jobId=process.argv[3],token=process.env.CAREERFINDER_SESSION_TOKEN;
if(!path||!jobId||!token)throw Error("Usage: CAREERFINDER_SESSION_TOKEN=... node scripts/upload-application-receipt.mjs application-receipts/ID.json JOB_ID");
const receipt=JSON.parse(await readFile(path,"utf8"));
const response=await fetch("https://careerfinder-search.tovidonninger.workers.dev/api/private/recruitment/application-executor/receipt",{method:"POST",headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({...receipt,jobId}),signal:AbortSignal.timeout(20000)});
const data=await response.json();if(!response.ok)throw Error(JSON.stringify(data));
console.log(JSON.stringify(data,null,2));
