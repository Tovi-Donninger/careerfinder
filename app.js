const KEY="careerfinder-v1";let data;try{data=JSON.parse(localStorage.getItem(KEY))||{apps:[],roles:[],cv:""}}catch{data={apps:[],roles:[],cv:""}}let searches=0;const el=id=>document.getElementById(id);const esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));function save(){localStorage.setItem(KEY,JSON.stringify(data));stats()}function stats(){el("search-count").textContent=searches;el("role-count").textContent=data.roles.length;el("app-count").textContent=data.apps.length}function toast(s){el("toast").textContent=s;el("toast").classList.add("show");setTimeout(()=>el("toast").classList.remove("show"),2200)}
function showExternalSearches(q,loc){
 const mode=el("work-mode")?el("work-mode").value:"any";
 const suffix=mode==="remote"?" remote":mode==="hybrid"?" hybrid":mode==="onsite"?" on-site":"";
 const term=(q||"jobs")+suffix;
 const place=(loc||"").trim();
 const encoded=encodeURIComponent(term);
 const placeEncoded=encodeURIComponent(place);
 const links=[
  ["LinkedIn","https://www.linkedin.com/jobs/search/?keywords="+encoded+"&location="+placeEncoded],
  ["Indeed","https://www.indeed.com/jobs?q="+encoded+"&l="+placeEncoded],
  ["Glassdoor","https://www.glassdoor.com/Job/jobs.htm?sc.keyword="+encoded+"&locName="+placeEncoded],
  ["Wellfound","https://wellfound.com/jobs?query="+encoded],
  ["Himalayas","https://himalayas.app/jobs?search="+encoded],
  ["We Work Remotely","https://weworkremotely.com/remote-jobs/search?term="+encoded]
 ];
 const box=el("more-sources");
 if(box)box.innerHTML='<details class="external-search"><summary>More places to search <span>Optional links to other job websites</span></summary><p>These links open searches on the websites themselves. They are not vacancies imported or verified by CareerFinder.</p><div class="source-links">'+links.map(x=>'<a class="source-link" target="_blank" rel="noopener noreferrer" href="'+x[1]+'"><span>'+x[0]+' ↗</span></a>').join("")+'</div></details>';
}
let searchLoadingTimer=null;
function showSearchLoading(){
 const box=el("jobs");
 box.className="search-loading";
 box.setAttribute("aria-live","polite");
 box.innerHTML='<div class="loading-orbit" aria-hidden="true"><span class="orbit-dot"></span><span class="orbit-core">C</span></div><div class="loading-copy"><span class="loading-eyebrow">CAREERFINDER AI · LIVE SEARCH</span><h4>Finding your next opportunity</h4><p id="loading-stage">Understanding your search criteria…</p><div class="loading-track" role="progressbar" aria-label="Search progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="8"><span id="loading-progress"></span></div><div class="loading-steps"><span class="active" data-step="0"><i>01</i> Understand</span><span data-step="1"><i>02</i> Discover</span><span data-step="2"><i>03</i> Review</span><span data-step="3"><i>04</i> Shortlist</span></div><small class="loading-footnote">Searching job sites and comparing individual vacancies against your preferences. Progress updates as each phase is expected to run; results appear when the server responds.</small></div>';
 const stages=[{label:"Understanding your search criteria…",progress:12},{label:"Expanding job titles and related opportunities…",progress:28},{label:"Searching job boards and employer career pages…",progress:48},{label:"Reviewing individual listings against your requirements…",progress:70},{label:"Selecting and preparing your strongest matches…",progress:88}];
 let stage=0;
 const update=()=>{
  const line=el("loading-stage"),bar=el("loading-progress"),track=box.querySelector('[role="progressbar"]');
  if(line)line.textContent=stages[stage].label;
  if(bar)bar.style.width=stages[stage].progress+"%";
  if(track)track.setAttribute("aria-valuenow",String(stages[stage].progress));
  const active=stage<2?stage:stage<4?2:3;
  box.querySelectorAll("[data-step]").forEach(node=>{node.classList.toggle("active",Number(node.dataset.step)===active);node.classList.toggle("done",Number(node.dataset.step)<active)});
 };
 update();
 if(searchLoadingTimer)clearInterval(searchLoadingTimer);
 searchLoadingTimer=setInterval(()=>{if(stage<stages.length-1){stage++;update();}},3800);
}
function stopSearchLoading(){
 if(searchLoadingTimer){clearInterval(searchLoadingTimer);searchLoadingTimer=null}
}
function showFallbackSearches(q,loc,message){
 const box=el("jobs");
 box.className="empty";
 box.innerHTML='<h4>No matching vacancies found</h4><p>'+esc(message)+'</p><p><strong>Your search:</strong> '+esc(q||"Any job")+' · '+esc(loc||"Any location")+'</p><p>Try a broader title or location. You can also expand “More places to search” for optional external websites.</p>';
}
function experienceMatches(job,level){if(level==="any")return true;const title=(job.title||"").toLowerCase(),desc=(job.description||"").toLowerCase(),text=title+" "+desc+" "+(job.category||"")+" "+(job.tags||[]).join(" ");const patterns={ "no-experience":/no experience|no prior experience|without experience|experience not required|training provided|entry[- ]level|graduate|intern/i, internship:/intern(ship)?|trainee/i, entry:/entry[- ]level|graduate|recent graduate|new grad|no experience|junior/i, junior:/junior|0\s*[-–to]+\s*2 years|1\s*[-–to]+\s*2 years/i, associate:/associate|2\s*[-–to]+\s*4 years/i, mid:/mid[- ]level|3\s*[-–to]+\s*7 years|4\s*[-–to]+\s*6 years/i, senior:/senior|7\+? years|8\+? years|lead engineer|principal/i, manager:/manager|management|team lead|head of/i, executive:/director|executive|vice president|\\bvp\\b|chief [a-z]+ officer/i};if(patterns[level].test(text))return true;if(level==="junior"&&/entry[- ]level/.test(title))return true;if(level==="entry"&&/junior/.test(title))return true;return false}
async function cachedFeed(key,url,ttl){const cacheKey="careerfinder-feed-"+key;try{const cached=JSON.parse(localStorage.getItem(cacheKey)||"null");if(cached&&Date.now()-cached.savedAt<ttl)return cached.value}catch{}const r=await fetch(url);if(!r.ok)throw Error("HTTP "+r.status);const value=await r.json();try{localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),value}))}catch{}return value}
function boardIds(id){return (el(id)?.value||"").split(/[,\n]/).map(x=>x.trim()).filter(Boolean).slice(0,15)}
function stripHtml(v){return String(v||"").replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim()}
async function greenhouseJSONP(token){const cacheKey="careerfinder-feed-gh-"+token;try{const cached=JSON.parse(localStorage.getItem(cacheKey)||"null");if(cached&&Date.now()-cached.savedAt<3600000)return cached.value}catch{}const value=await new Promise((resolve,reject)=>{const callback="careerFinderGH_"+Date.now()+"_"+Math.floor(Math.random()*100000);const script=document.createElement("script");const cleanup=()=>{delete window[callback];script.remove()};window[callback]=data=>{cleanup();resolve(data)};script.onerror=()=>{cleanup();reject(Error("Greenhouse JSONP request failed"))};script.src="https://boards-api.greenhouse.io/v1/boards/"+encodeURIComponent(token)+"/jobs?content=true&callback="+callback;document.head.appendChild(script)});try{localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),value}))}catch{}return value}
async function greenhouseJobs(token){const d=await greenhouseJSONP(token);return (d.jobs||[]).map(j=>({title:j.title,company:token,location:j.location?.name||"Unspecified",description:stripHtml(j.content),url:j.absolute_url,tags:(j.departments||[]).map(x=>x.name),remote:/remote|anywhere/i.test((j.location?.name||"")+" "+(j.content||"")),source:"Greenhouse",sourceUrl:"https://www.greenhouse.com/",updatedAt:j.updated_at}))}
async function ashbyJobs(board){const d=await cachedFeed("ashby-"+board,"https://api.ashbyhq.com/posting-api/job-board/"+encodeURIComponent(board)+"?includeCompensation=true",3600000);return (d.jobs||[]).filter(j=>j.isListed!==false).map(j=>({title:j.title,company:board,location:j.location||"Unspecified",description:stripHtml(j.descriptionPlain||j.descriptionHtml),url:j.applyUrl||j.jobUrl,tags:[j.department,j.team].filter(Boolean),remote:!!j.isRemote,source:"Ashby",sourceUrl:"https://www.ashbyhq.com/",updatedAt:j.publishedAt,salary:j.compensation?.compensationTierSummary||""}))}
async function search(e){
 e.preventDefault();
 const q=el("query").value.trim(),loc=el("location").value.trim(),level=el("experience").value,mode=el("work-mode").value;
 const cv=el("cv").value.trim();
 const roles=(data.roles||[]).slice(0,5);
 if(!q&&!loc&&!cv&&!roles.length){toast("Enter a job title, location or CV first.");return}
 searches++;stats();document.querySelectorAll(".ai-summary").forEach(x=>x.remove());const moreSources=el("more-sources");if(moreSources)moreSources.innerHTML="";
 showSearchLoading();
 el("result-count").textContent="AI search in progress";
 try{
  const response=await fetch("https://careerfinder-search.tovidonninger.workers.dev/api/search",{
   method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},
   body:JSON.stringify({query:q,location:loc,experience:level,workMode:mode,cv,roles})
  });
  const payload=await response.json();stopSearchLoading();
  if(!response.ok)throw Error(payload.error||"Search service returned HTTP "+response.status);
  const rows=payload.jobs||[];
  const connected=(payload.sources||[]).filter(x=>x.status==="connected").length;
  el("result-count").textContent=rows.length+" AI-selected matches from "+(payload.candidatesReviewed||0)+" reviewed listings";
  if(payload.profileSummary)el("jobs").insertAdjacentHTML("beforebegin",'<p class="ai-summary">'+esc(payload.profileSummary)+'</p>');
  if(!rows.length){showFallbackSearches(q,loc,"The AI search ran but did not find indexed vacancies for these criteria. Try broader keywords or another location.");return}
  el("jobs").className="";
  el("jobs").innerHTML=rows.map((x,i)=>'<article class="job curated-job"><div class="job-main"><h4>'+esc(x.title)+'</h4><small>'+esc(x.company||x.source||"Job listing")+' · '+esc(x.location||"Location not stated")+'</small><p>'+esc(x.matchReason||"Selected by AI as a relevant match.")+'</p></div><div class="job-actions"><a href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">View vacancy ↗</a></div></article>').join("");
 }catch(error){
  stopSearchLoading();
  showFallbackSearches(q,loc,error.message||"CareerFinder could not complete the AI search.");
  el("result-count").textContent="AI search unavailable";
 }
}
const catalog=[["Sales Development Representative",["sales","customer","client","communication","lead","prospecting","negotiation","crm"],"Uses communication and commercial skills to identify and develop customer opportunities."],["Customer Success Associate",["customer","client","support","communication","relationship","account","service"],"A direction for people who enjoy helping customers and building long-term relationships."],["Recruitment Coordinator",["recruitment","human resources","hr","interview","candidate","people","administration"],"Combines organisation and people skills to coordinate hiring and candidate experiences."],["Operations Coordinator",["operations","process","logistics","coordination","planning","administration","supply chain"],"Uses planning and coordination to keep teams and processes moving."],["Office Administrator",["administration","office","organise","scheduling","documents","data entry","management"],"A practical route for people with office, scheduling and organisational experience."],["Project Coordinator",["project","planning","coordination","deadline","stakeholder","reporting","communication"],"Builds on organising tasks, communicating and keeping deadlines on track."],["Marketing Coordinator",["marketing","social media","content","campaign","writing","research","analytics"],"Connects communication and research strengths with campaigns and content."],["Business Development Associate",["business development","sales","partnership","client","negotiation","strategy"],"A route for commercially minded candidates who enjoy finding opportunities."],["Junior Data Analyst",["excel","data","analysis","reporting","sql","statistics","research","spreadsheet"],"May suit candidates with analytical and reporting skills; technical gaps may need training."],["Logistics Coordinator",["logistics","shipping","inventory","warehouse","export","import","supply chain"],"Uses attention to detail and coordination in supply-chain operations."],["Financial Services Associate",["finance","financial","investment","insurance","compliance","advice","budget"],"Uses financial-services knowledge, detail and client communication."],["HR Assistant",["human resources","hr","payroll","employee","onboarding","recruitment","people"],"An entry route into people operations, especially with admin and communication strengths."],["Technical Support Specialist",["technical support","troubleshooting","software","it","customer support","problem solving"],"Combines structured problem-solving with clear user communication."]];let cvLoadingTimer=null;
function showCVLoading(){
 const box=el("matches");
 box.className="panel cv-loading";
 box.setAttribute("aria-live","polite");
 box.innerHTML='<div class="loading-orbit" aria-hidden="true"><span class="orbit-dot"></span><span class="orbit-core">C</span></div><div class="loading-copy"><span class="loading-eyebrow">CAREERFINDER AI · CV ASSESSMENT</span><h4>Finding the strengths in your experience</h4><p id="cv-loading-stage">Preparing your CV for assessment…</p><div class="loading-track" role="progressbar" aria-label="CV assessment progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="10"><span id="cv-loading-progress"></span></div><div class="loading-steps"><span class="active" data-cv-step="0"><i>01</i> Read CV</span><span data-cv-step="1"><i>02</i> Identify skills</span><span data-cv-step="2"><i>03</i> Match experience</span><span data-cv-step="3"><i>04</i> Suggest careers</span></div><small class="loading-footnote">Reviewing your education, work history and transferable skills. Your assessment will appear as soon as the AI responds.</small></div>';
 const stages=[{label:"Preparing your CV for assessment…",progress:12},{label:"Identifying your education and professional strengths…",progress:34},{label:"Finding transferable skills from your experience…",progress:58},{label:"Matching your background to realistic career paths…",progress:78},{label:"Preparing your personalised career suggestions…",progress:90}];
 let stage=0;
 const update=()=>{
  const line=el("cv-loading-stage"),bar=el("cv-loading-progress"),track=box.querySelector('[role="progressbar"]');
  if(line)line.textContent=stages[stage].label;
  if(bar)bar.style.width=stages[stage].progress+"%";
  if(track)track.setAttribute("aria-valuenow",String(stages[stage].progress));
  const active=stage<1?0:stage<2?1:stage<3?2:3;
  box.querySelectorAll("[data-cv-step]").forEach(node=>{node.classList.toggle("active",Number(node.dataset.cvStep)===active);node.classList.toggle("done",Number(node.dataset.cvStep)<active)});
 };
 update();
 if(cvLoadingTimer)clearInterval(cvLoadingTimer);
 cvLoadingTimer=setInterval(()=>{if(stage<stages.length-1){stage++;update();}},3000);
}
function stopCVLoading(){if(cvLoadingTimer){clearInterval(cvLoadingTimer);cvLoadingTimer=null}}
async function matchCV(){
 const cv=el("cv").value.trim();
 if(cv.length<40){toast("Add more CV or experience detail first.");return}
 data.cv=cv;save();
 const button=el("analyse");button.disabled=true;button.textContent="Assessing your CV…";
 showCVLoading();
 try{
  const response=await fetch("https://careerfinder-search.tovidonninger.workers.dev/api/analyse",{
   method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},
   body:JSON.stringify({cv})
  });
  const result=await response.json();
  if(!response.ok)throw Error(result.error||"CV analysis failed.");
  const skills=(result.keySkills||[]).map(x=>'<span class="skill-chip">'+esc(x)+'</span>').join("");
  const education=(result.education||[]).map(x=>'<li>'+esc(x)+'</li>').join("");
  const roles=result.careerSuggestions||[];
  el("matches").className="panel";
  el("matches").innerHTML='<small>AI CAREER ANALYSIS</small><h3>Your experience, translated into opportunities</h3><p>'+esc(result.profileSummary||"Your CV has been analysed.")+'</p>'+(education?'<h4>Education identified</h4><ul class="ai-list">'+education+'</ul>':'')+(skills?'<h4>Key skills</h4><div class="skill-chips">'+skills+'</div>':'')+'<h4>Suggested career directions</h4>'+roles.map(r=>'<article class="role"><h4>'+esc(r.title)+'</h4><p>'+esc(r.reason)+'</p><small>'+esc(r.level||"Suggested direction")+'</small><div class="role-actions"><button data-role="'+esc(r.title)+'">Save career</button> <button data-role-search="'+esc(r.searchTerms||r.title)+'">Find matching jobs →</button></div></article>').join("");
  toast("AI career analysis complete.");
 }catch(error){
  el("matches").className="panel empty";el("matches").innerHTML='<h3>AI analysis could not be completed</h3><p>'+esc(error.message)+'</p><p>Your CV remains saved in this browser. Please try again.</p>';
 }finally{stopCVLoading();button.disabled=false;button.textContent="Analyse my experience →"}
}
function renderApps(){let box=el("applications");if(!data.apps.length){box.className="empty";box.textContent="No applications tracked yet. Add a job above or track one from search results.";return}box.className="";box.innerHTML=data.apps.map((a,i)=>'<article class="application"><div><strong>'+esc(a.title)+'</strong><small>'+esc(a.company||"Company not specified")+'</small></div><div>'+(a.url?'<a href="'+esc(a.url)+'" target="_blank" rel="noopener">Open listing ↗</a>':'<small>No link added</small>')+'</div><select data-status="'+i+'">'+["Viewed","Interested","Applied","Interview","Offer","Rejected","Not interested","Expired"].map(s=>'<option '+(a.status===s?'selected':'')+'>'+s+'</option>').join("")+'</select><button data-remove="'+i+'">Remove</button></article>').join("")}
el("search-form").addEventListener("submit",search);el("cv").value=data.cv||"";el("cvfile").addEventListener("change",async e=>{let f=e.target.files[0];if(!f)return;if(!f.name.toLowerCase().endsWith(".txt")){toast("This prototype accepts .txt files. Paste text from PDF or Word.");return}el("cv").value=await f.text();toast("Text CV loaded in this browser.")});el("analyse").addEventListener("click",matchCV);el("add-form").addEventListener("submit",e=>{e.preventDefault();data.apps.unshift({title:el("app-title").value,company:el("company").value,url:el("app-url").value,status:"Interested"});e.target.reset();save();renderApps();toast("Added to your tracker.")});document.addEventListener("click",e=>{const opened=e.target.closest("[data-job-open]");if(opened){const url=opened.dataset.trackUrl;if(!data.apps.some(a=>a.url===url)){data.apps.unshift({title:opened.dataset.trackTitle,company:opened.dataset.trackCompany,url,status:"Viewed"});save();renderApps();toast("Listing saved as Viewed.");}return}let b=e.target.closest("[data-track]");if(b){data.apps.unshift({title:b.dataset.track,company:b.dataset.company,url:b.dataset.url,status:"Interested"});save();renderApps();toast("Job added to tracker.");return}b=e.target.closest("[data-role]");if(b){if(!data.roles.includes(b.dataset.role))data.roles.push(b.dataset.role);save();toast("Career saved.");return}b=e.target.closest("[data-role-search]");if(b){const role=b.dataset.roleSearch;el("query").value=role;el("location").value=el("location").value.trim();el("search").scrollIntoView({behavior:"smooth"});el("search-form").requestSubmit();return}b=e.target.closest("[data-remove]");if(b){data.apps.splice(+b.dataset.remove,1);save();renderApps()}});document.addEventListener("change",e=>{let s=e.target.closest("[data-status]");if(s){data.apps[+s.dataset.status].status=s.value;save();toast("Status updated.")}});renderApps();stats();