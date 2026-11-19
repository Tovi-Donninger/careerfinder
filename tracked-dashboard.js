(()=>{
  const byId=id=>document.getElementById(id);
  const applied=byId("submitted-records"),rejected=byId("rejected-records");
  const T=window.careerfinderTracking;
  if(!applied||!rejected||!T)return;
  const appliedStatus=byId("submitted-status"),rejectedStatus=byId("rejected-status");

  function cell(row,value=""){
    const td=document.createElement("td");
    td.textContent=value;
    row.append(td);
    return td;
  }

  function dateLabel(value){
    if(!value)return "";
    const iso=value.replace(" ","T");
    const date=new Date(/[zZ]|[+-]\d\d:\d\d$/.test(iso)?iso:iso+"Z");
    return Number.isNaN(date.getTime())?value:date.toLocaleString([], {dateStyle:"medium",timeStyle:"short"});
  }

  function renderRows(body,jobs,isApplied){
    body.replaceChildren();
    for(const job of jobs){
      const row=document.createElement("tr");
      const name=document.createElement("strong");
      name.textContent=[job.title,job.company].filter(Boolean).join(" — ");
      cell(row).append(name);
      if(!isApplied&&job.was_submitted){
        const note=document.createElement("div");
        note.className="ai-summary";
        note.textContent="Previously submitted with external confirmation.";
        name.parentNode.append(note);
      }
      cell(row,job.location||"Not stated");
      cell(row,dateLabel(job.date));
      if(isApplied){
        cell(row,job.status==="Applied"?"Applied by you":job.provider||"Confirmed submission");
        cell(row,job.external_reference||"—");
      }
      const vacancy=cell(row);
      if(/^https:\/\//.test(job.url||"")){
        const link=document.createElement("a");
        link.href=job.url;
        link.target="_blank";
        link.rel="noopener noreferrer";
        link.textContent="View vacancy";
        vacancy.append(link);
      }
      T.control(cell(row),job.job_id||job.id,T.state(job.status),Boolean(job.was_submitted||job.external_reference));
      body.append(row);
    }
  }

  let refreshVersion=0;
  async function refresh(){
    const version=++refreshVersion;
    appliedStatus.textContent=rejectedStatus.textContent="Loading applications…";
    const [tracked,confirmed]=await Promise.allSettled([
      Promise.resolve().then(()=>window.careerfinderTrackedJobs()),
      Promise.resolve().then(()=>window.careerfinderConfirmedSubmissions())
    ]);
    if(version!==refreshVersion)return;
    const jobs=tracked.value?.jobs||[];
    const rejectedJobs=jobs.filter(job=>job.status==="Rejected");
    const rejectedIds=new Set(rejectedJobs.map(job=>job.id));
    const submittedByJob=new Map();
    for(const job of jobs){
      if(job.status==="Applied")submittedByJob.set(job.id,{...job,date:job.marked_at});
    }
    for(const job of confirmed.value?.applications||[]){
      if(job.status==="Submitted"&&!rejectedIds.has(job.job_id)){
        submittedByJob.set(job.job_id,{...job,date:job.submitted_at});
      }
    }
    const applications=[...submittedByJob.values()].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
    renderRows(applied,applications,true);
    renderRows(rejected,rejectedJobs.map(job=>({...job,date:job.marked_at})),false);
    const errors=[];
    if(tracked.status==="rejected")errors.push("Manually marked applications could not be loaded. "+tracked.reason.message);
    if(confirmed.status==="rejected")errors.push("Confirmed submissions could not be loaded. "+confirmed.reason.message);
    appliedStatus.textContent=errors.length?errors.join(" "):applications.length+" applied applications.";
    rejectedStatus.textContent=tracked.status==="rejected"?"Rejected jobs could not be loaded. "+tracked.reason.message:rejectedJobs.length+" rejected jobs.";
    byId("saved-applied").textContent=errors.length?"—":applications.length;
    byId("saved-rejected").textContent=tracked.status==="rejected"?"—":tracked.value.rejected??rejectedJobs.length;
  }

  byId("submitted-refresh").addEventListener("click",refresh);
  byId("rejected-refresh").addEventListener("click",refresh);
  window.careerfinderRefreshTracked=refresh;
  if(byId("cloud-session-panel")&&!byId("cloud-session-panel").hidden)refresh();
})();
