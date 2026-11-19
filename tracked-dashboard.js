// "Applied (by you)" and "Rejected" lists: jobs Tovi has marked, saved by the Worker. Undo moves a job back to the review lists.
(()=>{
const byId=id=>document.getElementById(id);
const T=window.careerfinderTracking;
const lists=[["Applied","applied-records","applied-status","applied-refresh","Nothing marked as applied yet. Press “I applied” on a job above after you have applied."],["Rejected","rejected-records","rejected-status","rejected-refresh","Nothing marked as rejected yet."]];
if(!byId("applied-records")||!T)return;
const cell=(row,text)=>{const td=document.createElement("td");td.textContent=text??"";row.appendChild(td);return td};
const when=v=>{const d=new Date(String(v||"").replace(" ","T")+"Z");return isNaN(d)?String(v||""):d.toLocaleString([], {dateStyle:"medium",timeStyle:"short"})};
const setTile=(id,n)=>{const el=byId(id);if(el)el.textContent=n};
function fill(name,tbody,status,jobs,empty){
  tbody.replaceChildren();
  for(const job of jobs){
    const tr=document.createElement("tr");
    const head=cell(tr,"");const strong=document.createElement("strong");strong.textContent=job.title+" — "+job.company;head.append(strong);
    if(job.was_submitted){const n=document.createElement("div");n.className="ai-summary";n.textContent="This had been submitted by AI with employer confirmation.";head.append(n)}
    cell(tr,job.location||"Not stated");
    cell(tr,when(job.marked_at));
    const link=cell(tr,"");if(/^https:\/\//.test(job.url||"")){const a=document.createElement("a");a.href=job.url;a.target="_blank";a.rel="noopener noreferrer";a.textContent="View vacancy";link.append(a)}
    T.control(cell(tr,""),job.id,T.state(job.status));
    tbody.append(tr);
  }
  status.textContent=jobs.length?jobs.length+" job"+(jobs.length===1?"":"s")+" marked "+name.toLowerCase()+". Undo moves a job back to the review lists.":empty;
}
async function refresh(){
  for(const [,tb,st] of lists)byId(st).textContent="Loading…";
  try{
    const data=await window.careerfinderTrackedJobs();const jobs=data.jobs||[];
    for(const [name,tb,st,,empty] of lists)fill(name,byId(tb),byId(st),jobs.filter(j=>j.status===name),empty);
    setTile("saved-applied",data.applied??0);setTile("saved-rejected",data.rejected??0);
  }catch(e){for(const [,tb,st] of lists){byId(tb).replaceChildren();byId(st).textContent="Could not load: "+e.message}}
}
for(const [,,,btn] of lists)byId(btn).addEventListener("click",refresh);
window.careerfinderRefreshTracked=refresh;
if(byId("cloud-session-panel")&&!byId("cloud-session-panel").hidden)refresh();
})();
