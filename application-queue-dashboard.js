(()=>{
const byId=id=>document.getElementById(id),body=byId("queue-records"),status=byId("queue-status");
if(!body||!status)return;
const T=window.careerfinderTracking;
const cell=(row,value)=>{const td=document.createElement("td");td.textContent=value??"";row.appendChild(td);return td};
const decision=item=>item.aiAssessment?.decision||"unassessed";
const rank={suitable:0,needs_review:1,unassessed:2,unsuitable:3};
const tracked=item=>T.state(item.status,item.provider);
// Once Tovi has marked a job Applied or Rejected it no longer needs his attention.
const attention=item=>tracked(item)==="open"&&(String(item.reason||"").trim().toUpperCase().startsWith("NEEDS TOVI:")||item.status==="Blocked"||/^Application handoff started/i.test(item.reason||""));
let allItems=[];
const filterSelect=byId("queue-filter");
function render(){
  body.replaceChildren();
  const chosen=filterSelect?filterSelect.value:"all";
  const items=allItems.filter(i=>T.matches(chosen,tracked(i),attention(i))).sort((a,b)=>Number(attention(b))-Number(attention(a))||(rank[decision(a)]??2)-(rank[decision(b)]??2)||Number(b.aiAssessment?.score??b.match_score??0)-Number(a.aiAssessment?.score??a.match_score??0)||String(b.updated_at||"").localeCompare(String(a.updated_at||"")));
  const counts={suitable:0,unsuitable:0,needs_review:0,unassessed:0};
  let flagged=0;
  for(const item of allItems)counts[decision(item)]=(counts[decision(item)]||0)+1;
  for(const item of items){
    const ai=item.aiAssessment,d=decision(item),st=tracked(item);
    const row=document.createElement("tr");
    const needs=attention(item);
    if(needs){flagged++;row.className="needs-attention"}
    if(d==="unsuitable"||st==="rejected"){row.style.opacity="0.65";row.style.backgroundColor="rgba(150,150,150,0.08)"}
    const job=cell(row,"");
    if(needs){const flag=document.createElement("span");flag.className="attention-pill";flag.textContent="Needs your attention";job.append(flag,document.createElement("br"))}
    const title=document.createElement("strong");title.textContent=(item.title||"Vacancy")+" — "+(item.company||"");job.append(title);
    if(ai){const summary=document.createElement("div");summary.className="ai-summary";summary.textContent=ai.summary||"AI assessment recorded";job.append(summary)}
    cell(row,item.channel?.channel||"Unknown");
    const state=cell(row,"");
    const badge=document.createElement("span");badge.className="ai-pill ai-"+d;
    badge.textContent=item.provider==="grok-hold"?"Held by Grok Bot":ai?(d==="suitable"?"AI suitable":d==="unsuitable"?"AI unsuitable":"AI needs review"):"Not AI assessed";
    state.append(badge);
    if(ai&&ai.decision==="suitable"&&ai.experienceGate==="met"&&Number.isInteger(ai.score)){const score=document.createElement("div");score.className="ai-score";score.textContent="AI suitability: "+ai.score+"/100";state.append(score)}
    T.control(cell(row,""),item.job_id,st);
    const detail=cell(row,"");
    if(ai){
      for(const [label,value] of [["Experience",ai.experience],["Language",ai.language],["Israel eligibility",ai.israelEligibility],["Opening",ai.opening]]){
        if(value){const p=document.createElement("p");p.className="ai-detail";const b=document.createElement("strong");b.textContent=label+": ";p.append(b,document.createTextNode(value));detail.append(p)}
      }
      if(ai.blockers?.length){const p=document.createElement("p");p.className="ai-detail";p.textContent="Blockers: "+ai.blockers.join("; ");detail.append(p)}
      if(ai.evidence?.length){const details=document.createElement("details");const summary=document.createElement("summary");summary.textContent="Evidence from vacancy";details.append(summary);const ul=document.createElement("ul");for(const evidence of ai.evidence){const li=document.createElement("li");li.textContent=evidence;ul.append(li)}details.append(ul);detail.append(details)}
    }else detail.textContent=item.reason||item.channel?.reason||"Awaiting AI verification";
    const td=cell(row,"");
    if(/^https:\/\//.test(item.url||"")){const link=document.createElement("a");link.href=item.url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Open vacancy";td.append(link)}
    body.append(row);
  }
  const flaggedAll=allItems.filter(attention).length;
  const n=s=>allItems.filter(i=>tracked(i)===s).length;
  status.textContent="Showing "+items.length+" of "+allItems.length+" · "+(flaggedAll?flaggedAll+" need your attention · ":"")+counts.suitable+" AI suitable · "+counts.unsuitable+" AI unsuitable · "+counts.needs_review+" AI needs review · "+counts.unassessed+" not yet AI assessed · "+n("applied")+" applied by you · "+n("rejected")+" rejected. Held and blocked items are never submitted automatically; jobs you mark Applied or Rejected are never applied to again.";
}
async function refresh(){
  status.textContent="Loading AI-reviewed application queue…";
  try{const data=await window.careerfinderApplicationQueue();allItems=data.items||[];render()}
  catch(e){body.replaceChildren();status.textContent="Could not load queue: "+e.message}
}
T.filter(filterSelect,render);
byId("queue-refresh").addEventListener("click",refresh);
window.careerfinderRefreshApplicationQueue=refresh;
// Already signed in (saved session restored): load straight away instead of waiting for a click.
if(byId("cloud-session-panel")&&!byId("cloud-session-panel").hidden)refresh();
})();
