// Authenticated private handoff to local browser runner. No credentials or CV in GitHub.
import {writeFile} from "node:fs/promises";
const jobId=process.argv[2],cvFile=process.argv[3];
const token=process.env.CAREERFINDER_SESSION_TOKEN;
const machineKey=process.env.CAREERFINDER_AUTOMATION_KEY;
if(!jobId||!cvFile||(!token&&!machineKey))throw Error("Usage: CAREERFINDER_SESSION_TOKEN=... node scripts/fetch-application-handoff.mjs JOB_ID /absolute/path/cv.pdf");
const response=await fetch("https://careerfinder-search.tovidonninger.workers.dev/api/private/recruitment/application-executor/handoff",{method:"POST",headers:{...(machineKey?{"X-CareerFinder-Automation-Key":machineKey}:{"Authorization":"Bearer "+token}),"Content-Type":"application/json"},body:JSON.stringify({jobId}),signal:AbortSignal.timeout(20000)});
const data=await response.json();
if(!response.ok)throw Error(data.error+": "+(data.reasons||[]).join("; "));
const file="private-application-"+jobId.replace(/[^a-z0-9_-]/gi,"")+".json";
const payload={...data,cvFile};
await writeFile(file,JSON.stringify(payload,null,2),{mode:0o600,flag:"wx"});
console.log("Private application handoff saved to "+file+"; inspect the employer vacancy and application before submitting.");
