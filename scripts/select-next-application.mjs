// Select one screened, not-yet-queued employer vacancy for the scheduled runner.
// This is a candidate selector, not proof of eligibility or permission to submit.
const key=process.env.CAREERFINDER_AUTOMATION_KEY;
if(!key)throw Error("Missing CAREERFINDER_AUTOMATION_KEY");
const res=await fetch("https://careerfinder-search.tovidonninger.workers.dev/api/private/recruitment/application-executor/next",{method:"POST",headers:{"X-CareerFinder-Automation-Key":key,"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(20000)});
const data=await res.json();
if(!res.ok)throw Error("Candidate selection failed: "+(data.error||res.status));
const job=data.jobs?.[0];
if(!job){console.log("No eligible new employer vacancies in the private discovery database.");process.exit(0)}
if(!/^[a-zA-Z0-9_-]{1,100}$/.test(job.id))throw Error("Unexpected job ID");
console.log("Selected screened employer vacancy: "+job.title+" — "+job.company);
const fs=await import("node:fs/promises");
await fs.appendFile(process.env.GITHUB_OUTPUT||"/dev/null","job_id="+job.id+"\n");
