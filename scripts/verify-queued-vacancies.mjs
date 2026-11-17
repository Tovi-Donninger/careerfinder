// Scheduled AI vacancy assessment against employer text and candidate profile; never submits a job.
const key=process.env.CAREERFINDER_AUTOMATION_KEY;
if(!key)throw Error("Missing CAREERFINDER_AUTOMATION_KEY");
const res=await fetch("https://careerfinder-search.tovidonninger.workers.dev/api/private/recruitment/verify-queue",{
 method:"POST",headers:{"X-CareerFinder-Automation-Key":key,"Content-Type":"application/json"},
 body:"{}",signal:AbortSignal.timeout(190000)
});
const data=await res.json();
if(!res.ok)throw Error("AI vacancy review failed: "+(data.error||res.status));
console.log(JSON.stringify({checked:data.checked,results:data.results?.map(({title,result,blockers})=>({title,result,blockers})),reviewMethod:data.reviewMethod,automaticApproval:false},null,2));
