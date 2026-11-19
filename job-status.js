// Tovi's own tracking controls: mark a reviewed job "Applied" (he applied himself) or "Rejected", with Undo.
// The status is saved by the Worker (D1), so it survives reloads and devices. Shared by the findings and queue tables.
(()=>{
  const FILTERS=[["all","All jobs"],["open","Not decided yet (default)"],["attention","Needs your attention"],["applied","Applied by you"],["rejected","Rejected"],["submitted","Submitted (confirmed)"]];
  // Where a job stands for Tovi, from the saved queue status.
  const state=(status,provider)=>status==="Applied"?"applied":status==="Rejected"?"rejected":status==="Submitted"?"submitted":"open";
  const LABEL={open:"Not decided yet",applied:"Applied (by you)",rejected:"Rejected",submitted:"Submitted (confirmed)"};
  const matches=(filter,st,attention)=>filter==="all"||filter===st||(filter==="attention"&&attention&&st==="open");
  const refreshAll=()=>{for(const n of ["careerfinderRefreshRecruitment","careerfinderRefreshApplicationQueue","careerfinderRefreshTracked"])if(typeof window[n]==="function")window[n]()};
  // A message that stays on screen so a failed save can never go unnoticed.
  function toast(text,isError){
    let el=document.getElementById("track-toast");
    if(!el){el=document.createElement("div");el.id="track-toast";el.setAttribute("role","alert");el.addEventListener("click",()=>{el.hidden=true});document.body.append(el)}
    el.className=isError?"track-toast track-toast-error":"track-toast";el.textContent=text;el.hidden=false;
    clearTimeout(toast.t);toast.t=setTimeout(()=>{el.hidden=true},isError?15000:4000);
  }
  function button(text,cls,onClick,title){const b=document.createElement("button");b.type="button";b.className="secondary track-btn "+cls;b.textContent=text;if(title)b.title=title;b.addEventListener("click",onClick);return b}
  // Fill a table cell with the status pill and the buttons that make sense for it.
  function control(cell,jobId,st,wasSubmitted=false){
    cell.replaceChildren();
    const pill=document.createElement("span");pill.className="track-pill track-"+st;pill.textContent=LABEL[st];cell.append(pill);
    if(!jobId)return;
    const msg=document.createElement("div");msg.className="track-msg";msg.setAttribute("role","status");
    const act=async(status)=>{
      for(const b of cell.querySelectorAll("button"))b.disabled=true;
      msg.textContent=status==="Reset"?"Undoing…":"Saving…";
      try{
        let result=await window.careerfinderSetJobStatus(jobId,status);
        while(status==="Reset"&&["Applied","Rejected"].includes(result.status)){
          result=await window.careerfinderSetJobStatus(jobId,status);
        }
        const destination=result.status==="Submitted"||result.status==="Applied"?"Applied applications":result.status==="Rejected"?"Rejected":"the undecided jobs";
        toast("Saved. Moved to "+destination+".",false);
        refreshAll();
      }
      catch(e){msg.textContent="Could not save: "+e.message;toast("Could not save your change: "+e.message,true);for(const b of cell.querySelectorAll("button"))b.disabled=false;if(status==="Reset")refreshAll()}
    };
    const row=document.createElement("div");row.className="track-actions";
    if(st!=="applied"&&st!=="submitted"&&!wasSubmitted)row.append(button("Applied","track-applied",()=>act("Applied"),"Mark as applied by you"));
    if(st!=="rejected")row.append(button("Rejected","track-rejected",()=>act("Rejected"),"Employer rejected you, or you are dismissing this job"));
    if(st==="applied"||st==="rejected")row.append(button(wasSubmitted?"Restore to Applied":"Not decided yet","track-undo",()=>act("Reset"),wasSubmitted?"Restore the confirmed submission":"Clear your decision"));
    cell.append(row,msg);
  }
  // Populate a filter <select> and call onChange when it changes.
  function filter(select,onChange){if(!select)return;if(!select.options.length){for(const [v,t] of FILTERS){const o=document.createElement("option");o.value=v;o.textContent=t;select.append(o)}select.value="open"}select.addEventListener("change",onChange)}
  window.careerfinderTracking={state,matches,control,filter,toast,LABEL};
})();
