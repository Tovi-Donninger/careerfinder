(()=>{
const byId=id=>document.getElementById(id);
const tbody=byId("recruitment-records"),status=byId("recruitment-status");
if(!tbody)return;
const T=window.careerfinderTracking;
const cell=(row,text)=>{const td=document.createElement("td");td.textContent=text??"";row.appendChild(td);return td};
// Items needing Tovi: verification_status needs_review, or a match_reason starting "NEEDS TOVI:".
// Once Tovi has marked a job Applied or Rejected it no longer needs his attention.
const attention=job=>T.state(job.queue_status,job.queue_provider)==="open"&&(/needs[_ ]review/i.test(job.verification_status||"")||String(job.match_reason||"").trim().toUpperCase().startsWith("NEEDS TOVI:"));
let allJobs=[];
const filterSelect=byId("recruitment-filter");
const setTile=(id,n)=>{const el=byId(id);if(el)el.textContent=n};
function render(){
  tbody.replaceChildren();
  const chosen=filterSelect?filterSelect.value:"all";
  const jobs=allJobs.filter(j=>T.matches(chosen,T.state(j.queue_status,j.queue_provider),attention(j))).sort((a,b)=>Number(attention(b))-Number(attention(a)));
  let flagged=0;
  for(const job of jobs){
    const st=T.state(job.queue_status,job.queue_provider);
    const tr=document.createElement("tr");
    const needs=attention(job);
    if(needs){flagged++;tr.className="needs-attention"}
    else if(st==="rejected")tr.className="decided-rejected";
    const head=cell(tr,"");
    if(needs){const badge=document.createElement("span");badge.className="attention-pill";badge.textContent="Needs your attention";head.append(badge,document.createElement("br"))}
    const name=document.createElement("strong");name.textContent=(job.title||"")+" — "+(job.company||"");head.append(name);
    if(job.match_reason){const why=document.createElement("div");why.className="ai-summary";why.textContent=job.match_reason;head.append(why)}
    cell(tr,job.location||"Not stated");
    cell(tr,Number.isInteger(job.match_score)?job.match_score+"%":"Not assessed");
    cell(tr,job.verification_status||"Unverified");
    T.control(cell(tr,""),job.id,st);
    cell(tr,job.discovered_at||"");
    const td=cell(tr,"");const a=document.createElement("a");a.href=job.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent="View vacancy";td.appendChild(a);
    tbody.appendChild(tr);
  }
  const count=s=>allJobs.filter(j=>T.state(j.queue_status,j.queue_provider)===s).length;
  setTile("saved-applied",count("applied"));setTile("saved-rejected",count("rejected"));setTile("saved-open",count("open"));
  const flaggedAll=allJobs.filter(attention).length;
  status.textContent=(flaggedAll?flaggedAll+" need your attention · ":"")+"Showing "+jobs.length+" of "+allJobs.length+" saved job discoveries · "+count("applied")+" applied by you · "+count("rejected")+" rejected · "+count("submitted")+" submitted by AI with confirmation. Use “I applied” or “Rejected” on a job to track it; Undo reverses it.";
}
async function refresh(){
  status.textContent="Loading saved recruitment findings…";
  try{const result=await window.careerfinderRecruitmentJobs();allJobs=result.jobs||[];render()}
  catch(e){tbody.replaceChildren();status.textContent="Could not load discoveries: "+e.message}
}
T.filter(filterSelect,render);
byId("recruitment-refresh").addEventListener("click",refresh);
window.careerfinderRefreshRecruitment=refresh;
// Already signed in (saved session restored): load straight away instead of waiting for a click.
if(byId("cloud-session-panel")&&!byId("cloud-session-panel").hidden)refresh();
})();
