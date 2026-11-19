// CareerFinder cloud authentication. Never store passwords.
(()=>{
  const API="https://careerfinder-search.tovidonninger.workers.dev";
  const KEY="careerfinder.cloud.session.v2";
  const OLD_KEY="careerfinder.cloud.session.v1";
  const $=id=>document.getElementById(id);
  let token="",expiresAt=0,remember=false;
  function clearStored(){for(const s of [sessionStorage,localStorage]){try{s.removeItem(KEY)}catch{}}}
  function restore(){
    for(const [store,persistent] of [[sessionStorage,false],[localStorage,true]]){
      try{
        const item=JSON.parse(store.getItem(KEY)||"null");
        if(item&&/^[a-f0-9]{64}$/.test(item.token||"")&&Number(item.expiresAt)>Date.now()){
          token=item.token;expiresAt=Number(item.expiresAt);remember=persistent;return;
        }
        store.removeItem(KEY);
      }catch{try{store.removeItem(KEY)}catch{}}
    }
  }
  function migrateLegacy(){
    if(token)return;
    try{
      const old=JSON.parse(sessionStorage.getItem(OLD_KEY)||"null");
      if(old&&/^[a-f0-9]{64}$/.test(old.token||"")&&Number(old.expiresAt)>Date.now()){
        token=old.token;expiresAt=Number(old.expiresAt);remember=false;save();
      }
      sessionStorage.removeItem(OLD_KEY);
    }catch{}
  }
  function save(){
    clearStored();
    const store=remember?localStorage:sessionStorage;
    try{store.setItem(KEY,JSON.stringify({token,expiresAt}))}catch{}
  }
  function signedOut(message){
    token="";expiresAt=0;clearStored();render(message||"Signed out.");
  }
  function render(message){
    const loggedIn=!!token&&expiresAt>Date.now();
    $("cloud-login").hidden=loggedIn;
    $("cloud-session-panel").hidden=!loggedIn;
    $("cloud-remember").checked=remember;
    for(const id of ["cloud-upload","cloud-download","cloud-logout"])$(id).disabled=!loggedIn;
    $("cloud-status").textContent=message||(loggedIn?"Signed in securely.":"Sign in to access your private profile.");
    $("cloud-auth-state").textContent=loggedIn?"Signed in":"Signed out";
  }
  async function call(path,method="GET",body){
    if(token&&expiresAt<=Date.now())signedOut("Your 24-hour session expired. Please sign in again.");
    const headers={"Content-Type":"application/json"};
    if(token)headers.Authorization="Bearer "+token;
    const response=await fetch(API+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    const result=await response.json();
    if(response.status===401&&path!=="/api/private/login")signedOut("Your session expired or was revoked. Please sign in again.");
    if(!response.ok)throw Error(result.error||"Request failed");
    return result;
  }
  function requireLogin(){if(!token||expiresAt<=Date.now()){signedOut("Please sign in to access your cloud workspace.");throw Error("Sign in to Secure cloud workspace first.")}}
  window.careerfinderApplicationQueue=()=>{requireLogin();return call("/api/private/recruitment/application-queue")};
  window.careerfinderConfirmedSubmissions=()=>{requireLogin();return call("/api/private/recruitment/submitted-applications")};
  window.careerfinderRecruitmentJobs=()=>{requireLogin();return call("/api/private/recruitment/jobs")};
  window.careerfinderTrackedJobs=()=>{requireLogin();return call("/api/private/recruitment/tracked-jobs")};
  window.careerfinderSetJobStatus=(jobId,status,note)=>{requireLogin();return call("/api/private/recruitment/job-status","POST",{jobId,status,note})};
  window.careerfinderSaveJobs=jobs=>{requireLogin();return call("/api/private/recruitment/jobs","POST",{jobs})};
  window.careerfinderMatchedSearch=()=>{requireLogin();return call("/api/private/matched-search","POST",{})};
  function refresh(){
    for(const name of ["careerfinderRefreshRecruitment","careerfinderRefreshApplicationQueue","careerfinderRefreshTracked"]){
      if(typeof window[name]==="function")window[name]();
    }
  }
  $("cloud-login").addEventListener("submit",async event=>{
    event.preventDefault();
    const input=$("cloud-password");
    const requestedRemember=$("cloud-remember").checked;
    render("Signing in…");
    try{
      const result=await call("/api/private/login","POST",{password:input.value});
      if(!/^[a-f0-9]{64}$/.test(result.token||""))throw Error("Unexpected session response");
      token=result.token;expiresAt=Date.now()+Math.min(Number(result.expiresInSeconds)||86400,86400)*1000;
      remember=requestedRemember;
      save();
      render(remember?"Signed in. This browser will remember you for up to 24 hours.":"Signed in. This tab will remember you for up to 24 hours.");
      refresh();
    }catch(err){render("Sign-in failed: "+err.message)}
    finally{input.value=""}
  });
  $("cloud-upload").addEventListener("click",async()=>{
    if(!confirm("Save the currently entered profile to your private Cloudflare database?"))return;
    try{requireLogin();await call("/api/private/profile","PUT",{profile:getProfile()});render("Profile saved to Cloudflare D1.")}
    catch(err){render("Save failed: "+err.message)}
  });
  $("cloud-download").addEventListener("click",async()=>{
    if(!confirm("Replace the current profile form with your cloud-saved profile?"))return;
    try{
      requireLogin();
      const result=await call("/api/private/profile");
      for(const key of profileFields){
        const field=profileForm.elements.namedItem(key);
        if(field&&typeof result.profile[key]==="string")field.value=result.profile[key];
      }
      render("Cloud profile loaded. Click Save my profile to also save in this browser.");
    }catch(err){render("Load failed: "+err.message)}
  });
  $("cloud-logout").addEventListener("click",async()=>{
    try{if(token)await call("/api/private/logout","POST")}catch{}
    signedOut("Signed out. Saved login cleared from this browser.");
  });
  restore();
  migrateLegacy();
  render(token?"Signed in. Your saved session was restored.":"Sign in to access your private profile.");
  if(token)refresh();
})();
