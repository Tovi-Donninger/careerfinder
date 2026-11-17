// Continuous discovery: fetch public job feeds via the authenticated CareerFinder Worker.
// Discovered vacancies are stored as UNVERIFIED and cannot be auto-submitted.
const key=process.env.CAREERFINDER_AUTOMATION_KEY;
if(!key)throw Error("Missing CAREERFINDER_AUTOMATION_KEY");
const response=await fetch("https://careerfinder-search.tovidonninger.workers.dev/api/private/recruitment/discover",{method:"POST",headers:{"X-CareerFinder-Automation-Key":key,"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(110000)});
const data=await response.json();
if(!response.ok)throw Error("Discovery failed: "+(data.error||response.status));
console.log(JSON.stringify(data));
