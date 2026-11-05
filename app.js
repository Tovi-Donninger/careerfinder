const KEY="careerfinder-v1";let data;try{data=JSON.parse(localStorage.getItem(KEY))||{apps:[],roles:[],cv:""}}catch{data={apps:[],roles:[],cv:""}}let searches=0;const el=id=>document.getElementById(id);const esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));function save(){localStorage.setItem(KEY,JSON.stringify(data));stats()}function stats(){el("search-count").textContent=searches;el("role-count").textContent=data.roles.length+(data.careerIdeas||[]).length;el("app-count").textContent=data.apps.length}function toast(s){el("toast").textContent=s;el("toast").classList.add("show");setTimeout(()=>el("toast").classList.remove("show"),2200)}
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
 box.innerHTML='<div class="loading-orbit" aria-hidden="true"><span class="orbit-dot"></span><span class="orbit-core">C</span></div><div class="loading-copy"><span class="loading-eyebrow">CAREERFINDER AI · LIVE SEARCH</span><h4>Finding your next opportunity</h4><p id="loading-stage">Understanding your search criteria…</p><div class="loading-track" role="progressbar" aria-label="Search progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="8"><span id="loading-progress"></span></div><div class="loading-steps"><span class="active" data-step="0"><i>01</i> Understand</span><span data-step="1"><i>02</i> Discover</span><span data-step="2"><i>03</i> Review</span><span data-step="3"><i>04</i> Shortlist</span></div><small class="loading-footnote">CareerFinder is searching, reading job details and preparing your shortlist. Progress is an estimate.</small><small id="loading-clock" class="loading-footnote">Elapsed: 0:00</small></div>';
 const stages=[
  {label:"Understanding your search criteria…",progress:12},
  {label:"Searching job boards and employer websites…",progress:32},
  {label:"Reading individual vacancy details…",progress:58},
  {label:"Comparing jobs with your requirements…",progress:80},
  {label:"Ranking the strongest matches…",progress:94}
 ];
 let stage=0,elapsed=0;
 const update=()=>{
  const line=el("loading-stage"),bar=el("loading-progress"),track=box.querySelector('[role="progressbar"]');
  if(line)line.textContent=stages[stage].label;
  if(bar)bar.style.width=stages[stage].progress+"%";
  if(track)track.setAttribute("aria-valuenow",String(stages[stage].progress));
  const active=stage===0?0:stage===1?1:stage<4?2:3;
  box.querySelectorAll("[data-step]").forEach(node=>{node.classList.toggle("active",Number(node.dataset.step)===active);node.classList.toggle("done",Number(node.dataset.step)<active)});
  const clock=el("loading-clock");
  if(clock)clock.textContent="Elapsed: "+Math.floor(elapsed/60)+":"+String(elapsed%60).padStart(2,"0");
 };
 update();
 if(searchLoadingTimer)clearInterval(searchLoadingTimer);
 searchLoadingTimer=setInterval(()=>{
  elapsed++;
  if(stage<stages.length-1)stage++;
  else stage=stages.length-1;
  update();
 },4000);
}
function stopSearchLoading(){
 if(searchLoadingTimer){clearInterval(searchLoadingTimer);searchLoadingTimer=null}
}
function showFallbackSearches(q,loc,message){
 const box=el("jobs");
 box.className="empty";
 box.innerHTML='<h4>No matching vacancies found</h4><p>'+esc(message)+'</p><p><strong>Your search:</strong> '+esc(q||"Any job")+' · '+esc(loc||"Israel")+'</p><p>Try a broader job title or location.</p>';
}
function experienceMatches(job,level){if(level==="any")return true;const title=(job.title||"").toLowerCase(),desc=(job.description||"").toLowerCase(),text=title+" "+desc+" "+(job.category||"")+" "+(job.tags||[]).join(" ");const patterns={ "no-experience":/no experience|no prior experience|without experience|experience not required|training provided|entry[- ]level|graduate|intern/i, internship:/intern(ship)?|trainee/i, entry:/entry[- ]level|graduate|recent graduate|new grad|no experience|junior/i, junior:/junior|0\s*[-–to]+\s*2 years|1\s*[-–to]+\s*2 years/i, associate:/associate|2\s*[-–to]+\s*4 years/i, mid:/mid[- ]level|3\s*[-–to]+\s*7 years|4\s*[-–to]+\s*6 years/i, senior:/senior|7\+? years|8\+? years|lead engineer|principal/i, manager:/manager|management|team lead|head of/i, executive:/director|executive|vice president|\\bvp\\b|chief [a-z]+ officer/i};if(patterns[level].test(text))return true;if(level==="junior"&&/entry[- ]level/.test(title))return true;if(level==="entry"&&/junior/.test(title))return true;return false}
async function cachedFeed(key,url,ttl){const cacheKey="careerfinder-feed-"+key;try{const cached=JSON.parse(localStorage.getItem(cacheKey)||"null");if(cached&&Date.now()-cached.savedAt<ttl)return cached.value}catch{}const r=await fetch(url);if(!r.ok)throw Error("HTTP "+r.status);const value=await r.json();try{localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),value}))}catch{}return value}
function boardIds(id){return (el(id)?.value||"").split(/[,\n]/).map(x=>x.trim()).filter(Boolean).slice(0,15)}
function stripHtml(v){return String(v||"").replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim()}
async function greenhouseJSONP(token){const cacheKey="careerfinder-feed-gh-"+token;try{const cached=JSON.parse(localStorage.getItem(cacheKey)||"null");if(cached&&Date.now()-cached.savedAt<3600000)return cached.value}catch{}const value=await new Promise((resolve,reject)=>{const callback="careerFinderGH_"+Date.now()+"_"+Math.floor(Math.random()*100000);const script=document.createElement("script");const cleanup=()=>{delete window[callback];script.remove()};window[callback]=data=>{cleanup();resolve(data)};script.onerror=()=>{cleanup();reject(Error("Greenhouse JSONP request failed"))};script.src="https://boards-api.greenhouse.io/v1/boards/"+encodeURIComponent(token)+"/jobs?content=true&callback="+callback;document.head.appendChild(script)});try{localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),value}))}catch{}return value}
async function greenhouseJobs(token){const d=await greenhouseJSONP(token);return (d.jobs||[]).map(j=>({title:j.title,company:token,location:j.location?.name||"Unspecified",description:stripHtml(j.content),url:j.absolute_url,tags:(j.departments||[]).map(x=>x.name),remote:/remote|anywhere/i.test((j.location?.name||"")+" "+(j.content||"")),source:"Greenhouse",sourceUrl:"https://www.greenhouse.com/",updatedAt:j.updated_at}))}
async function ashbyJobs(board){const d=await cachedFeed("ashby-"+board,"https://api.ashbyhq.com/posting-api/job-board/"+encodeURIComponent(board)+"?includeCompensation=true",3600000);return (d.jobs||[]).filter(j=>j.isListed!==false).map(j=>({title:j.title,company:board,location:j.location||"Unspecified",description:stripHtml(j.descriptionPlain||j.descriptionHtml),url:j.applyUrl||j.jobUrl,tags:[j.department,j.team].filter(Boolean),remote:!!j.isRemote,source:"Ashby",sourceUrl:"https://www.ashbyhq.com/",updatedAt:j.publishedAt,salary:j.compensation?.compensationTierSummary||""}))}
function buildJobSearchPrompt(){
 const q=el("query").value.trim()||"HR, Human Resources, Logistics, Administration, Office Administrator and related junior roles";
 const loc=el("location").value.trim()||"Israel";
 const level=el("experience").value||"junior";
 const mode=el("work-mode").value||"onsite";
 const cv=(el("cv").value||"").trim();
 const savedRoles=(data.roles||[]).slice(0,12);
 return [
 "You are CareerFinder's live job-research assistant. Search the live web now. Do not just give advice or search-result pages.",
 "Find up to 15 CURRENT, INDIVIDUAL job vacancies in "+loc+". Aim for 15 genuinely suitable vacancies by searching multiple job boards, employer career pages and direct applicant-tracking-system pages. If fewer than 15 genuinely qualify, return fewer and explain why; never invent or pad results.",
 "SEARCH FOCUS: "+q+". Include adjacent roles that fit the candidate's transferable skills. Prioritise junior, entry-level and low-experience vacancies. Experience setting: "+level+". Work arrangement setting: "+mode+".",
 "HARD REQUIREMENTS: The advert and role must be suitable for an English-speaking applicant. Reject any vacancy that explicitly requires Hebrew or any other non-English language, even if described as an advantage. If the advert is in English and does not mention other languages, mark workingLanguage='Confirm with employer'.",
 "WORK ARRANGEMENT: Prefer on-site roles. If on-site is selected, reject explicitly hybrid and remote roles; accept roles where arrangement is not stated but label 'Not stated — verify with employer'.",
 "EXPERIENCE: Prioritise roles requiring 0-2 years. Distinguish mandatory requirements from preferred qualifications. Do not reject a role merely because experience is preferred rather than mandatory.",
 "FULL-TIME is preferred. Clearly identify employment type. Location must be in Israel unless the user's location says otherwise.",
 "QUALITY CONTROL: Open each vacancy page where possible. Every job must have a specific title, employer, location and direct URL to that individual vacancy/application page. Exclude expired, closed, duplicate, generic careers pages, search pages and recruitment directories. Do not claim a job is open unless the page gives evidence; otherwise use 'Not confirmed'. Provide a short match reason and the key experience/language/work-mode evidence.",
 "CANDIDATE BACKGROUND: BCom and Honours in Human Resource Management; experience as an office manager and salesperson; financial-adviser experience in insurance, investments, client acquisition, needs analysis and client relationships; telesales experience. No direct HR employment experience. Candidate is seeking opportunities in Israel and needs English-speaking work without mandatory Hebrew.",
 "SAVED CAREER INTERESTS: "+(savedRoles.join(", ")||"None saved yet")+".",
 "CANDIDATE CV / EXTRA DETAILS: "+(cv||"Use the background summary above; do not invent details."),
 "ALSO identify 5 realistic alternative career paths beyond the exact search titles. Explain transferable skills, likely entry level, why the candidate could fit, and any important skill gaps.",
 "RETURN STRICT JSON ONLY, no markdown fences and no commentary, using exactly this structure:",
 JSON.stringify({jobs:[{title:"",company:"",location:"",url:"https://",description:"",matchReason:"",experienceSummary:"",requiredExperienceYears:0,workingLanguage:"English / Confirm with employer",otherLanguageRequired:false,workArrangement:"On-site / Hybrid / Remote / Not stated",employmentType:"Full-time / Part-time / Contract / Not stated",availabilityStatus:"Confirmed open / Not confirmed",statusEvidence:""}],careerPaths:[{title:"",reason:"",transferableSkills:[""],entryLevel:"",skillGaps:[""]}],searchNotes:""},null,2),
 "Return up to 15 jobs. If the search genuinely finds 15 suitable vacancies, include all 15."
 ].join("\n\n");
}
function showChatGPTWorkflow(prompt){
 el("chatgpt-prompt").value=prompt;
 el("chatgpt-workflow").hidden=false;
 el("chatgpt-workflow").scrollIntoView({behavior:"smooth",block:"start"});
}
function search(e){
 e.preventDefault();searches++;stats();
 showChatGPTWorkflow(buildJobSearchPrompt());
 el("result-count").textContent="Ready for ChatGPT research";
 el("jobs").className="empty";
 el("jobs").innerHTML="<h4>Your search is ready</h4><p>Copy the instructions, open ChatGPT and run the research. When it returns the JSON, paste it into the import box above.</p>";
}
function parseChatGPTJSON(raw){
 let source=String(raw||"").trim().replace(new RegExp("^"+String.fromCharCode(96).repeat(3)+"(?:json)?\\s*","i"),"").replace(new RegExp("\\s*"+String.fromCharCode(96).repeat(3)+"$"),"");
 try{return JSON.parse(source)}catch{}
 const first=source.indexOf("{"),last=source.lastIndexOf("}");
 if(first<0||last<=first)throw Error("Could not find a JSON object. Copy the complete JSON response from ChatGPT.");
 return JSON.parse(source.slice(first,last+1));
}
function renderImportedResults(){
 const jobs=data.latestSearchResults||[], ideas=data.careerIdeas||[];
 el("result-count").textContent=jobs.length+" imported job vacancies";
 if(!jobs.length){el("jobs").className="empty";el("jobs").textContent="No imported jobs yet."}
 else{
  el("jobs").className="";
  el("jobs").innerHTML=jobs.map((j,i)=>'<article class="job curated-job"><div class="job-main"><h4>'+esc(j.title)+'</h4><small>'+esc(j.company||"Company not stated")+' · '+esc(j.location||"Location not stated")+'</small><div class="job-meta"><span>'+esc(j.availabilityStatus||"Not confirmed")+'</span><span>'+esc(j.workArrangement||"Work arrangement not stated")+'</span><span>'+esc(j.workingLanguage||"Confirm working language")+'</span></div>'+(j.description?'<p class="job-description">'+esc(j.description.slice(0,280))+'</p>':'')+'<p class="match-reason">'+esc(j.matchReason||"Review vacancy details before applying.")+'</p></div><div class="job-actions"><a href="'+esc(j.url)+'" target="_blank" rel="noopener noreferrer">View vacancy ↗</a><button type="button" data-import-track="'+i+'">Track job +</button></div></article>').join("");
 }
 const ideaBox=el("career-ideas");
 if(ideaBox)ideaBox.innerHTML=ideas.length?'<div class="panel"><small>CAREER EXPLORATION</small><h3>Alternative career paths to consider</h3>'+ideas.map((r,i)=>'<article class="role"><h4>'+esc(r.title)+'</h4><p>'+esc(r.reason||"")+'</p>'+(r.transferableSkills.length?'<p><strong>Transferable skills:</strong> '+esc(r.transferableSkills.join(", "))+'</p>':'')+(r.entryLevel?'<small>Likely entry point: '+esc(r.entryLevel)+'</small>':'')+(r.skillGaps.length?'<p><strong>Potential gaps:</strong> '+esc(r.skillGaps.join(", "))+'</p>':'')+'<div class="role-actions"><button type="button" data-save-career="'+i+'">Save career path</button><button type="button" data-career-search="'+i+'">Search this career →</button></div></article>').join("")+'</div>':"";
}
function importChatGPTResults(){
 try{
  const parsed=parseChatGPTJSON(el("chatgpt-import").value);
  const rawJobs=Array.isArray(parsed)?parsed:(parsed.jobs||parsed.vacancies||[]);
  const seen=new Set();
  const jobs=rawJobs.map(j=>({title:String(j.title||"").trim(),company:String(j.company||j.employer||"").trim(),location:String(j.location||"").trim(),url:String(j.url||j.applicationUrl||j.link||"").trim(),description:String(j.description||"").trim(),matchReason:String(j.matchReason||j.reason||"").trim(),experienceSummary:String(j.experienceSummary||"").trim(),availabilityStatus:String(j.availabilityStatus||"Not confirmed"),statusEvidence:String(j.statusEvidence||"").trim(),workArrangement:String(j.workArrangement||"Not stated"),workingLanguage:String(j.workingLanguage||j.languageStatus||"Confirm working language"),employmentType:String(j.employmentType||"Not stated")})).filter(j=>{
   if(!j.title||!j.company||!/^https?:\/\//i.test(j.url))return false;
   const key=j.url.replace(/[?#].*$/,"").replace(/\/$/,"").toLowerCase();
   if(seen.has(key))return false;seen.add(key);return true;
  }).slice(0,15);
  const careers=Array.isArray(parsed.careerPaths)?parsed.careerPaths:Array.isArray(parsed.alternativeCareers)?parsed.alternativeCareers:[];
  data.latestSearchResults=jobs;
  data.careerIdeas=careers.slice(0,8).map(r=>({title:String(r.title||"").trim(),reason:String(r.reason||"").trim(),transferableSkills:Array.isArray(r.transferableSkills)?r.transferableSkills.map(String).slice(0,8):[],entryLevel:String(r.entryLevel||r.level||""),skillGaps:Array.isArray(r.skillGaps)?r.skillGaps.map(String).slice(0,8):[]})).filter(r=>r.title);
  save();renderImportedResults();
  toast("Imported "+jobs.length+" jobs and "+data.careerIdeas.length+" career ideas.");
  if(!jobs.length&&!data.careerIdeas.length)throw Error("No usable jobs or career paths were found. Check that the JSON includes jobs and/or careerPaths.");
 }catch(error){toast(error.message||"Could not import that response.");}
}
function prepareCareerPrompt(){
 const cv=(el("cv").value||"").trim();
 if(cv.length<40){toast("Paste your CV or experience details first.");return}
 data.cv=cv;save();
 const prompt=["Act as a practical career strategist helping me identify realistic alternative career paths in Israel.","My goal is to identify roles beyond traditional HR that use my transferable skills and can be entered without fluent Hebrew. English-speaking workplace is essential; reject roles that require Hebrew or another non-English language.","My background: BCom and Honours in Human Resource Management; office manager and salesperson; financial adviser experience in insurance, investments, client acquisition, financial needs analysis, compliance and relationship building; telesales experience. I have no direct HR employment experience.","Analyse the CV below. Suggest 8-12 realistic career paths, prioritising junior/entry-level roles and opportunities where my existing skills count. Include job titles to search, why I could fit, transferable skills, likely entry level, skill gaps and a short plan to become more competitive.","Also suggest adjacent sectors and less obvious career directions. Be honest about roles that are unrealistic without extra training.","Return strict JSON only with this shape: "+JSON.stringify({careerPaths:[{title:"",reason:"",transferableSkills:[""],entryLevel:"",skillGaps:[""]}],searchNotes:""}),"CV / experience:\n"+cv].join("\n\n");
 showChatGPTWorkflow(prompt);el("result-count").textContent="Career exploration prompt ready";toast("Career exploration prompt prepared.");
}
function renderApps(){
 let box=el("applications");
 if(!data.apps.length){box.className="empty";box.textContent="No applications tracked yet. Add a job above or track one from search results.";return}
 box.className="";
 box.innerHTML=data.apps.map((a,i)=>'<article class="application"><div><strong>'+esc(a.title)+'</strong><small>'+esc(a.company||"Company not specified")+(a.dateApplied?" · Applied "+esc(a.dateApplied):"")+'</small></div><div>'+(a.url?'<a href="'+esc(a.url)+'" target="_blank" rel="noopener">Open listing ↗</a>':'<small>No link added</small>')+'</div><select data-status="'+i+'">'+["Viewed","Interested","Applied","Interview","Offer","Rejected","Not interested","Expired"].map(s=>'<option '+(a.status===s?'selected':'')+'>'+s+'</option>').join("")+'</select><button data-remove="'+i+'">Remove</button></article>').join("");
}
el("search-form").addEventListener("submit",search);el("cv").value=data.cv||"";async function extractCVFile(file){
 const name=file.name.toLowerCase();
 if(file.size>10*1024*1024)throw Error("Please choose a file smaller than 10 MB.");
 if(name.endsWith(".txt"))return await file.text();
 if(name.endsWith(".docx")){
  if(!window.mammoth)throw Error("The Word document reader did not load. Refresh the page and try again.");
  const result=await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});
  return result.value||"";
 }
 if(name.endsWith(".pdf")){
  if(!window.pdfjsLib)throw Error("The PDF reader did not load. Refresh the page and try again.");
  window.pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const pdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
  if(pdf.numPages>40)throw Error("This CV has more than 40 pages. Please upload a shorter version.");
  let pages=[];
  for(let n=1;n<=pdf.numPages;n++){
   const page=await pdf.getPage(n);
   const content=await page.getTextContent();
   pages.push(content.items.map(item=>item.str||"").join(" "));
  }
  return pages.join("\n");
 }
 throw Error("Please upload a PDF, Word (.docx) or text (.txt) CV.");
}
el("cvfile").addEventListener("change",async e=>{
 const file=e.target.files[0];if(!file)return;
 const button=el("analyse");button.disabled=true;button.textContent="Reading your CV…";
 try{
  const extracted=await extractCVFile(file);
  if(extracted.trim().length<40)throw Error("No readable text was found. If this is a scanned PDF, please upload a text-based PDF or paste the CV text for now.");
  el("cv").value=extracted.trim();data.cv=extracted.trim();save();
  toast("CV text extracted. You can now analyse it.");
 }catch(error){toast(error.message||"Could not read that file.");}
 finally{button.disabled=false;button.textContent="Explore career paths with ChatGPT →";e.target.value="";}
});el("analyse").addEventListener("click",prepareCareerPrompt);el("add-form").addEventListener("submit",e=>{e.preventDefault();data.apps.unshift({title:el("app-title").value,company:el("company").value,url:el("app-url").value,status:"Interested"});e.target.reset();save();renderApps();toast("Added to your tracker.")});document.addEventListener("click",e=>{const opened=e.target.closest("[data-job-open]");if(opened){const url=opened.dataset.trackUrl;if(!data.apps.some(a=>a.url===url)){data.apps.unshift({title:opened.dataset.trackTitle,company:opened.dataset.trackCompany,url,status:"Viewed"});save();renderApps();toast("Listing saved as Viewed.");}return}let imported=e.target.closest("[data-import-track]");if(imported){const j=(data.latestSearchResults||[])[+imported.dataset.importTrack];if(j&&!data.apps.some(a=>a.url===j.url)){data.apps.unshift({title:j.title,company:j.company,url:j.url,status:"Interested"});save();renderApps();toast("Job added to your application tracker.");}else if(j)toast("This job is already in your tracker.");return}let career=e.target.closest("[data-save-career]");if(career){const r=(data.careerIdeas||[])[+career.dataset.saveCareer];if(r&&!data.roles.includes(r.title))data.roles.push(r.title);save();toast("Career path saved.");return}career=e.target.closest("[data-career-search]");if(career){const r=(data.careerIdeas||[])[+career.dataset.careerSearch];if(r){el("query").value=r.title;el("search").scrollIntoView({behavior:"smooth"});el("search-form").requestSubmit()}return}let b=e.target.closest("[data-track]");if(b){data.apps.unshift({title:b.dataset.track,company:b.dataset.company,url:b.dataset.url,status:"Interested"});save();renderApps();toast("Job added to tracker.");return}b=e.target.closest("[data-role]");if(b){if(!data.roles.includes(b.dataset.role))data.roles.push(b.dataset.role);save();toast("Career saved.");return}b=e.target.closest("[data-role-search]");if(b){const role=b.dataset.roleSearch;el("query").value=role;el("location").value=el("location").value.trim();el("search").scrollIntoView({behavior:"smooth"});el("search-form").requestSubmit();return}b=e.target.closest("[data-remove]");if(b){data.apps.splice(+b.dataset.remove,1);save();renderApps()}});document.addEventListener("change",e=>{let s=e.target.closest("[data-status]");if(s){const a=data.apps[+s.dataset.status];a.status=s.value;if(s.value==="Applied"&&!a.dateApplied)a.dateApplied=new Date().toISOString().slice(0,10);if(!["Applied","Interview","Offer"].includes(s.value))delete a.dateApplied;save();renderApps();toast("Status updated.")}});renderApps();renderImportedResults();stats();
el("copy-chatgpt-prompt").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(el("chatgpt-prompt").value);toast("Instructions copied. Open ChatGPT and paste them.");}catch{el("chatgpt-prompt").select();toast("Select and copy the instructions manually.");}});
el("open-chatgpt").addEventListener("click",()=>{window.open("https://chatgpt.com/","_blank","noopener,noreferrer");toast("ChatGPT opened. Paste the copied instructions there.");});
el("import-chatgpt-results").addEventListener("click",importChatGPTResults);
