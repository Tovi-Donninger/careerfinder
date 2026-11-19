// Tovi's own tracking controls: mark a reviewed job "Applied" (he applied himself) or "Rejected", with Undo.
// The status is saved by the Worker (D1), so it survives reloads and devices. Shared by the findings and queue tables.
(()=>{
  const FILTERS=[["all","All jobs"],["open","Not decided yet"],["attention","Needs your attention"],["applied","Applied by you"],["rejected","Rejected"],["submitted","Submitted by AI (confirmed)"]];
  // Where a job stands for Tovi, from the saved queue status.
  const state=(status,provider)=>status==="Applied"?"applied":status==="Rejected"?"rejected":status==="Submitted"?"submitted":"open";
  const LABEL={open:"Not decided yet",applied:"Applied (by you)",rejected:"Rejected",submitted:"Submitted by AI (confirmed)"};
  const matches=(filter,st,attention)=>filter==="all"||filter===st||(filter==="attention"&&attention&&st==="open");
  const refreshAll=()=>{for(const n of ["careerfinderRefreshRecruitment","careerfinderRefreshApplicationQueue","careerfinderRefreshConfirmedSubmissions"])if(typeof window[n]==="function")window[n]()};
  function button(text,cls,onClick,title){const b=document.createElement("button");b.type="button";b.className="secondary track-btn "+cls;b.textContent=text;if(title)b.title=title;b.addEventListener("click",onClick);return b}
  // Fill a table cell with the status pill and the buttons that make sense for it.
  function control(cell,jobId,st){
    cell.replaceChildren();
    const pill=document.createElement("span");pill.className="track-pill track-"+st;pill.textContent=LABEL[st];cell.append(pill);
    if(!jobId)return;
    const msg=document.createElement("div");msg.className="track-msg";msg.setAttribute("role","status");
    const act=async(status)=>{
      for(const b of cell.querySelectorAll("button"))b.disabled=true;
      msg.textContent=status==="Reset"?"Undoing…":"Saving…";
      try{await window.careerfinderSetJobStatus(jobId,status);refreshAll()}
      catch(e){msg.textContent="Could not save: "+e.message;for(const b of cell.querySelectorAll("button"))b.disabled=false}
    };
    const row=document.createElement("div");row.className="track-actions";
    if(st!=="applied"&&st!=="submitted")row.append(button("I applied","track-applied",()=>act("Applied"),"Mark as applied by you"));
    if(st!=="rejected")row.append(button("Rejected","track-rejected",()=>act("Rejected"),"Employer rejected you, or you are dismissing this job"));
    if(st==="applied"||st==="rejected")row.append(button("Undo","track-undo",()=>act("Reset"),"Return to how it was before"));
    cell.append(row,msg);
  }
  // Populate a filter <select> and call onChange when it changes.
  function filter(select,onChange){if(!select)return;if(!select.options.length)for(const [v,t] of FILTERS){const o=document.createElement("option");o.value=v;o.textContent=t;select.append(o)}select.addEventListener("change",onChange)}
  window.careerfinderTracking={state,matches,control,filter,LABEL};
})();
