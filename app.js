const KEY="careerfinder-v1";let data;try{data=JSON.parse(localStorage.getItem(KEY))||{apps:[],roles:[],cv:""}}catch{data={apps:[],roles:[],cv:""}}let searches=0;const el=id=>document.getElementById(id);const esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));function save(){localStorage.setItem(KEY,JSON.stringify(data));stats()}function stats(){el("search-count").textContent=searches;el("role-count").textContent=data.roles.length;el("app-count").textContent=data.apps.length}function toast(s){el("toast").textContent=s;el("toast").classList.add("show");setTimeout(()=>el("toast").classList.remove("show"),2200)}
function showExternalSearches(q,loc){
 const mode=el("work-mode")?el("work-mode").value:"any";
 const suffix=mode==="remote"?" remote":mode==="hybrid"?" hybrid":mode==="onsite"?" on-site":"";
 const term=(q||"jobs")+suffix;
 const encoded=encodeURIComponent(term);
 const place=encodeURIComponent(loc||"");
 const combined=encodeURIComponent([term,loc].filter(Boolean).join(" "));
 const googleTerm=encodeURIComponent('"'+term+'" '+(loc||"")+" jobs careers");
 const links=[
  ["LinkedIn Jobs","https://www.linkedin.com/jobs/search/?keywords="+encoded+"&location="+place,"Live search on LinkedIn"],
  ["Indeed","https://www.indeed.com/jobs?q="+encoded+"&l="+place,"Live search on Indeed"],
  ["Glassdoor","https://www.glassdoor.com/Job/jobs.htm?sc.keyword="+encoded+"&locName="+place,"Live search on Glassdoor"],
  ["Himalayas","https://himalayas.app/jobs?search="+encoded,"Search jobs"],
  ["Wellfound","https://wellfound.com/jobs?query="+encoded,"Search jobs"],
  ["We Work Remotely","https://weworkremotely.com/remote-jobs/search?term="+encoded,"Search remote jobs"],
  ["Working Nomads","https://www.workingnomads.com/jobs?search="+encoded,"Search jobs"],
  ["Jobspresso","https://jobspresso.co/?s="+encoded,"Search jobs"],
  ["Greenhouse employer vacancies","https://www.google.com/search?q="+encodeURIComponent('site:boards.greenhouse.io '+googleTerm),"Find direct employer listings"],
  ["Lever employer vacancies","https://www.google.com/search?q="+encodeURIComponent('site:jobs.lever.co '+googleTerm),"Find direct employer listings"],
  ["Ashby employer vacancies","https://www.google.com/search?q="+encodeURIComponent('site:jobs.ashbyhq.com '+googleTerm),"Find direct employer listings"],
  ["Workable employer vacancies","https://www.google.com/search?q="+encodeURIComponent('site:apply.workable.com '+googleTerm),"Find direct employer listings"],
  ["SmartRecruiters vacancies","https://www.google.com/search?q="+encodeURIComponent('site:jobs.smartrecruiters.com '+googleTerm),"Find direct employer listings"],
  ["Google company career pages","https://www.google.com/search?q="+encodeURIComponent(term+" "+(loc||"")+" careers jobs"),"Find employer vacancies"],
  ["Facebook public job posts","https://www.facebook.com/search/posts/?q="+combined,"Search public posts"]
 ];
 const box=el("more-sources");
 if(box)box.innerHTML='<div class="sources-heading"><div><h4>Search on other free job sites</h4><p>These open pre-filled searches on external sites. Direct ATS searches help find vacancies hosted by employers on Greenhouse, Lever, Ashby, Workable and SmartRecruiters. These are external searches, not imported listings.</p></div><span class="free-tag">FREE TO SEARCH</span></div><div class="source-links">'+links.map(x=>'<a class="source-link" target="_blank" rel="noopener noreferrer" href="'+x[1]+'"><span>'+x[0]+'</span><small>'+x[2]+' ↗</small></a>').join("")+'</div>';
}
function showFallbackSearches(q,loc,message){
 const box=el("jobs");
 box.className="empty";
 box.innerHTML='<h4>No live listings to display</h4><p>'+esc(message)+'</p><p><strong>Your search details:</strong> '+esc(q||"Any job")+' · '+esc(loc||"Any location")+'</p><p>Use the live search links below. They open results on the job websites themselves; those sites may require sign-in.</p>';
 el("more-sources").scrollIntoView({behavior:"smooth",block:"nearest"});
}
function experienceMatches(job,level){if(level==="any")return true;const title=(job.title||"").toLowerCase(),desc=(job.description||"").toLowerCase(),text=title+" "+desc+" "+(job.category||"")+" "+(job.tags||[]).join(" ");const patterns={ "no-experience":/no experience|no prior experience|without experience|experience not required|training provided|entry[- ]level|graduate|intern/i, internship:/intern(ship)?|trainee/i, entry:/entry[- ]level|graduate|recent graduate|new grad|no experience|junior/i, junior:/junior|0\s*[-–to]+\s*2 years|1\s*[-–to]+\s*2 years/i, associate:/associate|2\s*[-–to]+\s*4 years/i, mid:/mid[- ]level|3\s*[-–to]+\s*7 years|4\s*[-–to]+\s*6 years/i, senior:/senior|7\+? years|8\+? years|lead engineer|principal/i, manager:/manager|management|team lead|head of/i, executive:/director|executive|vice president|\\bvp\\b|chief [a-z]+ officer/i};if(patterns[level].test(text))return true;if(level==="junior"&&/entry[- ]level/.test(title))return true;if(level==="entry"&&/junior/.test(title))return true;return false}
async function search(e){
 e.preventDefault();
 const q=el("query").value.trim(),loc=el("location").value.trim(),level=el("experience").value;const mode=el("work-mode")?el("work-mode").value:"any";
 if(!q&&!loc){toast("Enter a job title or location.");return}
 searches++;stats();showExternalSearches(q,loc);el("jobs").textContent="Searching connected job sources…";el("result-count").textContent="Searching";
 const getJson=async url=>{const r=await fetch(url);if(!r.ok)throw Error("HTTP "+r.status);return r.json()};
 const cachedJson=async(key,url,ttl)=>{
  const cacheKey="careerfinder-feed-"+key;
  try{const cached=JSON.parse(localStorage.getItem(cacheKey)||"null");if(cached&&Date.now()-cached.savedAt<ttl)return cached.value}catch{}
  const value=await getJson(url);
  try{localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),value}))}catch{}
  return value;
 };
 const tasks=[
  cachedJson("arbeitnow-page-1","https://www.arbeitnow.com/api/job-board-api?page=1",60*60*1000).then(async first=>{
   const pages=[first,...await Promise.all([2,3,4,5].map(page=>cachedJson("arbeitnow-page-"+page,"https://www.arbeitnow.com/api/job-board-api?page="+page,60*60*1000)))];
   return pages.flatMap(p=>Array.isArray(p.data)?p.data:[]).map(x=>({title:x.title,company:x.company_name,location:x.location,description:x.description,url:x.url,tags:x.tags||[],remote:!!x.remote,source:"Arbeitnow",sourceUrl:"https://www.arbeitnow.com/"}));
  }),
  cachedJson("jobicy","https://jobicy.com/api/jobs?count=200",60*60*1000).then(j=>(j.jobs||[]).map(x=>({title:x.jobTitle||x.title,company:x.companyName||x.company,location:x.jobGeo||x.location||"Remote",description:x.jobDescription||x.description||"",url:x.url||x.jobUrl,tags:[...(x.jobIndustry||[]),...(x.jobType||[])],remote:true,source:"Jobicy",sourceUrl:"https://jobicy.com/"}))),
  cachedJson("remotive","https://remotive.com/api/remote-jobs",6*60*60*1000).then(j=>(j.jobs||[]).map(x=>({title:x.title,company:x.company_name,location:x.candidate_required_location||"Remote",description:x.description||"",url:x.url,tags:[x.category,x.job_type].filter(Boolean),remote:true,source:"Remotive",sourceUrl:"https://remotive.com/"})))
 ];
 const settled=await Promise.allSettled(tasks);
 const jobs=settled.flatMap(x=>x.status==="fulfilled"?x.value:[]);
 const sourceCount=settled.filter(x=>x.status==="fulfilled").length;
 const unique=[...new Map(jobs.filter(x=>x.url).map(x=>[x.url,x])).values()];
 const words=q.toLowerCase().split(/\s+/).filter(Boolean);
 const rows=unique.filter(x=>{
  const text=[x.title,x.company,x.description,x.location,...x.tags].join(" ").replace(/<[^>]*>/g," ").toLowerCase();
  const place=(x.location||"").toLowerCase();
  const locationOK=!loc||place.includes(loc.toLowerCase())||(loc.toLowerCase()==="remote"&&x.remote)||((/worldwide|anywhere|global|all countries/i.test(place))&&x.remote);
  const arrangement=(()=>{const combined=(x.title+" "+x.description+" "+x.location).toLowerCase();if(/hybrid|partly remote|partially remote|2-3 days in office|days in the office/.test(combined))return "hybrid";if(x.remote||/remote|work from home|work-from-home|anywhere in the world/.test(combined))return "remote";return "onsite"})();
  const titleText=(x.title||"").toLowerCase(),tagText=(x.tags||[]).join(" ").toLowerCase();
  const matchedWords=words.filter(w=>text.includes(w)).length;
  const queryOK=!q||matchedWords>=Math.max(1,Math.ceil(words.length*0.5))||words.some(w=>titleText.includes(w))||words.some(w=>tagText.includes(w));
  return queryOK&&locationOK&&(mode==="any"||arrangement===mode)&&experienceMatches({...x,category:x.tags.join(" ")},level);
 });
 el("result-count").textContent=rows.length+" matching listings · "+sourceCount+" of 3 free feeds connected";
 if(!rows.length){
  showFallbackSearches(q,loc,sourceCount?"No matching jobs were found across the connected feeds. Try broadening the title, location or experience filter, or use the external job-search links below.":"The free job feeds could not be reached. You can still continue using the external job-search links below.");
  return;
 }
 el("jobs").className="";
 el("jobs").innerHTML=rows.slice(0,40).map(x=>'<article class="job"><div><h4>'+esc(x.title)+'</h4><small>'+esc(x.company)+' · '+esc(x.location)+' · Source: <a href="'+esc(x.sourceUrl)+'" target="_blank" rel="noopener">'+esc(x.source)+'</a></small></div><div><button data-track="'+esc(x.title)+'" data-company="'+esc(x.company)+'" data-url="'+esc(x.url)+'">Track job +</button> <a href="'+esc(x.url)+'" target="_blank" rel="noopener" data-job-open="1" data-track-title="'+esc(x.title)+'" data-track-company="'+esc(x.company)+'" data-track-url="'+esc(x.url)+'">View job ↗</a></div></article>').join("");
}
const catalog=[["Sales Development Representative",["sales","customer","client","communication","lead","prospecting","negotiation","crm"],"Uses communication and commercial skills to identify and develop customer opportunities."],["Customer Success Associate",["customer","client","support","communication","relationship","account","service"],"A direction for people who enjoy helping customers and building long-term relationships."],["Recruitment Coordinator",["recruitment","human resources","hr","interview","candidate","people","administration"],"Combines organisation and people skills to coordinate hiring and candidate experiences."],["Operations Coordinator",["operations","process","logistics","coordination","planning","administration","supply chain"],"Uses planning and coordination to keep teams and processes moving."],["Office Administrator",["administration","office","organise","scheduling","documents","data entry","management"],"A practical route for people with office, scheduling and organisational experience."],["Project Coordinator",["project","planning","coordination","deadline","stakeholder","reporting","communication"],"Builds on organising tasks, communicating and keeping deadlines on track."],["Marketing Coordinator",["marketing","social media","content","campaign","writing","research","analytics"],"Connects communication and research strengths with campaigns and content."],["Business Development Associate",["business development","sales","partnership","client","negotiation","strategy"],"A route for commercially minded candidates who enjoy finding opportunities."],["Junior Data Analyst",["excel","data","analysis","reporting","sql","statistics","research","spreadsheet"],"May suit candidates with analytical and reporting skills; technical gaps may need training."],["Logistics Coordinator",["logistics","shipping","inventory","warehouse","export","import","supply chain"],"Uses attention to detail and coordination in supply-chain operations."],["Financial Services Associate",["finance","financial","investment","insurance","compliance","advice","budget"],"Uses financial-services knowledge, detail and client communication."],["HR Assistant",["human resources","hr","payroll","employee","onboarding","recruitment","people"],"An entry route into people operations, especially with admin and communication strengths."],["Technical Support Specialist",["technical support","troubleshooting","software","it","customer support","problem solving"],"Combines structured problem-solving with clear user communication."]];function matchCV(){let t=el("cv").value.trim().toLowerCase();if(t.length<40){toast("Add more CV or experience detail first.");return}data.cv=el("cv").value;save();let found=catalog.map(r=>({name:r[0],skills:r[1],why:r[2],hits:r[1].filter(s=>t.includes(s))})).filter(r=>r.hits.length).map(r=>({...r,score:Math.min(98,Math.round(r.hits.length/Math.max(4,Math.min(r.skills.length,7))*100))})).sort((a,b)=>b.score-a.score).slice(0,6);el("matches").className="panel";el("matches").innerHTML='<small>YOUR FIRST CAREER DIRECTIONS</small><h3>Suggested roles</h3><p class="note">Keyword-based suggestions, not a hiring prediction. Review what fits you.</p>'+(found.length?found.map(r=>'<article class="role"><span class="score">'+r.score+'% skill signal</span><h4>'+esc(r.name)+'</h4><p>'+esc(r.why)+'</p><button data-role="'+esc(r.name)+'">Save career</button> <button data-role-search="'+esc(r.name)+'">Find jobs →</button></article>').join(""):'<p>No clear matches yet. Add more detail about responsibilities, skills, education and achievements.');toast("Career suggestions generated locally.")}
function renderApps(){let box=el("applications");if(!data.apps.length){box.className="empty";box.textContent="No applications tracked yet. Add a job above or track one from search results.";return}box.className="";box.innerHTML=data.apps.map((a,i)=>'<article class="application"><div><strong>'+esc(a.title)+'</strong><small>'+esc(a.company||"Company not specified")+'</small></div><div>'+(a.url?'<a href="'+esc(a.url)+'" target="_blank" rel="noopener">Open listing ↗</a>':'<small>No link added</small>')+'</div><select data-status="'+i+'">'+["Viewed","Interested","Applied","Interview","Offer","Rejected","Not interested","Expired"].map(s=>'<option '+(a.status===s?'selected':'')+'>'+s+'</option>').join("")+'</select><button data-remove="'+i+'">Remove</button></article>').join("")}
el("search-form").addEventListener("submit",search);el("cv").value=data.cv||"";el("cvfile").addEventListener("change",async e=>{let f=e.target.files[0];if(!f)return;if(!f.name.toLowerCase().endsWith(".txt")){toast("This prototype accepts .txt files. Paste text from PDF or Word.");return}el("cv").value=await f.text();toast("Text CV loaded in this browser.")});el("analyse").addEventListener("click",matchCV);el("add-form").addEventListener("submit",e=>{e.preventDefault();data.apps.unshift({title:el("app-title").value,company:el("company").value,url:el("app-url").value,status:"Interested"});e.target.reset();save();renderApps();toast("Added to your tracker.")});document.addEventListener("click",e=>{const opened=e.target.closest("[data-job-open]");if(opened){const url=opened.dataset.trackUrl;if(!data.apps.some(a=>a.url===url)){data.apps.unshift({title:opened.dataset.trackTitle,company:opened.dataset.trackCompany,url,status:"Viewed"});save();renderApps();toast("Listing saved as Viewed.");}return}let b=e.target.closest("[data-track]");if(b){data.apps.unshift({title:b.dataset.track,company:b.dataset.company,url:b.dataset.url,status:"Interested"});save();renderApps();toast("Job added to tracker.");return}b=e.target.closest("[data-role]");if(b){if(!data.roles.includes(b.dataset.role))data.roles.push(b.dataset.role);save();toast("Career saved.");return}b=e.target.closest("[data-role-search]");if(b){const role=b.dataset.roleSearch;el("query").value=role;el("location").value=el("location").value.trim();el("search").scrollIntoView({behavior:"smooth"});el("search-form").requestSubmit();return}b=e.target.closest("[data-remove]");if(b){data.apps.splice(+b.dataset.remove,1);save();renderApps()}});document.addEventListener("change",e=>{let s=e.target.closest("[data-status]");if(s){data.apps[+s.dataset.status].status=s.value;save();toast("Status updated.")}});renderApps();stats();