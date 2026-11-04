const cors = {
  "Access-Control-Allow-Origin": "https://tovi-donninger.github.io",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
function clean(value, max = 12000) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}
function extractJSON(value) {
  const text = String(value || "").replace(/^\uFEFF/, "").trim();
  if (!text) throw new Error("The AI returned an empty response.");

  // First try parsing the complete response, including optional markdown fences.
  const unfenced = text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch (firstError) {
    // Some model responses include commentary or trailing text. Extract the
    // first balanced JSON object while respecting quoted strings and escapes.
    const start = unfenced.indexOf("{");
    if (start < 0) throw new Error("The AI response did not contain a JSON object.");

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < unfenced.length; i++) {
      const char = unfenced[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) {
          const candidate = unfenced.slice(start, i + 1);
          try {
            return JSON.parse(candidate);
          } catch (error) {
            throw new Error("The AI returned malformed JSON: " + clean(error.message, 160));
          }
        }
      }
    }

    throw new Error("The AI returned an incomplete JSON object.");
  }
}
async function askAI(env, system, user, maxTokens = 1200) {
  if (!env.AI) throw new Error("Cloudflare Workers AI is not connected. Add the AI binding to this Worker.");
  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    max_tokens: maxTokens,
    temperature: 0.2
  });
  return result.response || result.result?.response || "";
}
async function analyse(env, body) {
  const cv = clean(body.cv, 12000);
  if (cv.length < 40) return json({ error: "Please provide at least a few sentences from your CV." }, 400);
  const system = "You are a practical career coach. Analyse CV text accurately. Never invent qualifications, employers, years of experience or skills. Identify transferable skills and realistic adjacent roles. Return ONLY valid JSON with keys: profileSummary (string), keySkills (array of strings), education (array of strings), careerSuggestions (array of objects with title, reason, level, searchTerms). Give 6 to 8 suggestions, including adjacent career paths. Do not assume a country, language or work arrangement.";
  try {
    const raw = await askAI(env, system, "Analyse this CV and return the requested JSON. CV:\n" + cv, 1500);
    const result = extractJSON(raw);
    return json({
      profileSummary: clean(result.profileSummary, 900),
      keySkills: Array.isArray(result.keySkills) ? result.keySkills.slice(0, 12).map(x => clean(x, 80)) : [],
      education: Array.isArray(result.education) ? result.education.slice(0, 6).map(x => clean(x, 120)) : [],
      careerSuggestions: Array.isArray(result.careerSuggestions) ? result.careerSuggestions.slice(0, 8).map(x => ({
        title: clean(x.title, 100), reason: clean(x.reason, 320),
        level: clean(x.level, 60), searchTerms: clean(x.searchTerms || x.title, 160)
      })).filter(x => x.title) : []
    });
  } catch (error) {
    return json({ error: error.message || "AI analysis failed." }, 502);
  }
}
async function tavilySearch(key, query, domains) {
  const payload = {
    api_key: key, query, search_depth: "basic", topic: "general",
    max_results: 20, include_answer: false, include_raw_content: true
  };
  if (domains && domains.length) payload.include_domains = domains;
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error("Job search provider returned HTTP " + response.status);
  const data = await response.json();
  return (data.results || []).map(item => ({
    title: clean(item.title, 220),
    company: "",
    location: "",
    description: clean(item.raw_content || item.content, 1800),
    url: item.url,
    score: Number(item.score || 0),
    source: (() => { try { return new URL(item.url).hostname.replace(/^www\./, ""); } catch { return "Web search"; } })(),
    sourceUrl: item.url,
    foundAt: new Date().toISOString()
  })).filter(x => x.title && x.url && /^https?:\/\//i.test(x.url));
}

function fallbackTopJobs(candidates, preferences) {
  const terms = [preferences.query, ...(preferences.savedCareerRoles || [])].join(" ").toLowerCase().split(/[^a-z0-9+#]+/).filter(x => x.length > 2);
  const location = (preferences.location || "").toLowerCase();
  const generic = /\b(jobs? search|search results|career advice|how to|salary guide|home page|homepage|careers at)\b/i;
  const scored = candidates.map(job => {
    const title = (job.title || "").toLowerCase(), description = (job.description || "").toLowerCase(), url = (job.url || "").toLowerCase();
    if (generic.test(job.title || "") || /^https?:\/\/[^/]+\/?$/.test(url)) return null;
    let score = 35, hits = 0;
    for (const term of terms) {
      if (title.includes(term)) { score += 12; hits++; }
      else if (description.includes(term)) { score += 4; hits++; }
    }
    if (location && (description.includes(location) || title.includes(location))) score += 8;
    if (/\b(junior|entry.level|graduate|assistant|coordinator|associate|administrator|intern|trainee)\b/i.test(title)) score += 5;
    if (/linkedin\.com\/jobs\/view|indeed\.com\/viewjob|lever\.co|greenhouse\.io|ashbyhq\.com|workable\.com/i.test(url)) score += 8;
    return { job, score: Math.min(95, score), hits };
  }).filter(Boolean).sort((a,b) => b.score-a.score);
  return scored.filter(x => x.hits > 0).slice(0,10).map(({job,score,hits}) => ({
    ...job,
    matchReason: hits ? "Ranked using matching job-title and vacancy details." : "Potentially relevant vacancy; check the employer listing for full requirements.",
    matchScore: score
  }));
}

function isSearchOrProfilePage(job) {
  const url = String(job.url || "").toLowerCase();
  const title = String(job.title || "").toLowerCase();

  // Personal profiles and broad job-search/category pages are never vacancies.
  if (/linkedin\.com\/(in|pub)\//.test(url)) return true;
  if (/linkedin\.com\/jobs\/(?!view\/)/.test(url)) return true;
  if (/indeed\.com\/(q-|jobs\/|companies\/)/.test(url)) return true;
  if (/builtin\.com\/jobs\/.*\/search/.test(url)) return true;
  if (/\/(search|job-search|jobs-search)(\/|\?|$)/.test(url)) return true;
  if (/\b(jobs? in israel|israel jobs|job search|search results|open roles|career advice|salary guide)\b/.test(title)) return true;
  if (/facebook\.com\/groups\//.test(url) && !/\/posts?\//.test(url)) return true;

  return false;
}

function isIndividualVacancyURL(job) {
  let url;
  try {
    url = new URL(job.url);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.toLowerCase();

  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) {
    return /^\/jobs\/view\/[^/]+/.test(path);
  }
  if (host === "indeed.com" || host.endsWith(".indeed.com")) {
    return /^\/viewjob\/?$/.test(path) && Boolean(url.searchParams.get("jk"));
  }
  if (host.endsWith("smartrecruiters.com")) {
    return path.split("/").filter(Boolean).length >= 2 && /\d{5,}/.test(path);
  }
  if (host === "lever.co" || host.endsWith(".lever.co")) {
    return path.split("/").filter(Boolean).length >= 2;
  }
  if (host === "greenhouse.io" || host.endsWith(".greenhouse.io")) {
    return /\/jobs\/\d+/.test(path);
  }
  if (host === "ashbyhq.com" || host.endsWith(".ashbyhq.com")) {
    return path.split("/").filter(Boolean).length >= 2;
  }
  if (host === "workable.com" || host.endsWith(".workable.com")) {
    return path.includes("/j/") || path.includes("/jobs/");
  }
  if (/(^|\.)((jobvite|icims|personio|bamboohr|recruitee|teamtailor|workday|myworkdayjobs|oraclecloud|successfactors|ultipro|jobylon|comeet|breezy)\.com|breezy\.hr)$/.test(host)) {
    return path.split("/").filter(Boolean).length >= 2 && !/\/(search|careers|jobs)\/?$/.test(path);
  }
  if (host === "facebook.com" || host.endsWith(".facebook.com")) {
    return /\/groups\/[^/]+\/posts?\/\d+/.test(path);
  }

  // For other employers' career sites, require a job-like path and a
  // non-trivial URL rather than accepting a homepage or category landing page.
  return /\/(job|jobs|career|careers|vacancy|vacancies|position|positions)\//.test(path)
    && path.split("/").filter(Boolean).length >= 2;
}

function hasIsraelEvidence(job) {
  const evidence = [
    job.title || "",
    job.location || "",
    job.description || "",
    job.url || ""
  ].join(" ").toLowerCase();

  return /\b(israel|israeli|tel aviv|herzliya|ra'anana|raanana|jerusalem|haifa|netanya|beer sheva|beersheba|petah tikva|rishon lezion|ashdod|modiin|lod|holon|ramat gan|bnei brak|kfar saba|kfar-saba)\b/.test(evidence);
}

async function selectTopJobs(env, candidates, preferences) {
  if (!candidates.length) return [];

  const shortlist = candidates.slice(0, 80).map((job, index) => ({
    index,
    title: job.title,
    source: job.source,
    location: job.location || "",
    url: job.url,
    description: (job.description || "").slice(0, 420)
  }));

  const system = [
    "You are a recruitment shortlist reviewer.",
    "Review the supplied vacancy records against the candidate criteria.",
    "The target country is Israel unless the candidate criteria explicitly say otherwise.",
    "Only select jobs with evidence that the actual role is based in Israel or explicitly open to applicants in Israel. Do not treat the word Israel in a search query as proof of the job location.",
    "Only select individual vacancy advertisements with a direct vacancy URL. Exclude search pages, job category pages, employer homepages, LinkedIn profiles, articles, advice pages and duplicates.",
    "Never select a role based in another country merely because it is remote or mentions Israel in unrelated text.",
    "Use only supplied facts. Do not invent requirements. Missing details are unknown, not automatic disqualifiers.",
    "Your entire answer MUST be exactly one JSON object in this exact format:",
    '{"selected":[{"index":0,"matchReason":"Relevant junior role with matching duties","matchScore":85}]}',
    "The selected value MUST be an array. Each index MUST be copied from an input record. Select up to 30 strongest matches, best first. This is a pre-verification shortlist; return as many relevant individual vacancies as the records support. Return no markdown, no explanation and no other keys."
  ].join(" ");

  let parsed = null;
  let lastError = null;

  for (const attempt of [0, 1, 2]) {
    try {
      const items = attempt === 0
        ? shortlist
        : attempt === 1
          ? shortlist.map(({ index, title, source, location, url }) => ({ index, title, source, location, url }))
          : shortlist.map(({ index, title, source }) => ({ index, title, source }));

      const prompt = [
        "Candidate criteria: " + JSON.stringify(preferences),
        "Vacancy records: " + JSON.stringify(items),
        'Output exactly this JSON structure, populated with the best matching input indexes: {"selected":[{"index":0,"matchReason":"short reason","matchScore":85}]}',
        "If there are plausible matches, select them. Never make up an index."
      ].join("\n");

      const raw = await askAI(env, system, prompt, attempt === 0 ? 2600 : 1800);
      parsed = extractJSON(raw);

      // Accept common array-key variations from models, but always validate
      // every returned index against the original candidate list below.
      let list = Array.isArray(parsed) ? parsed : (
        parsed.selected || parsed.shortlist || parsed.matches ||
        parsed.jobs || parsed.results || parsed.recommendations
      );

      if (!Array.isArray(list)) {
        const keys = parsed && typeof parsed === "object" ? Object.keys(parsed).join(", ") : typeof parsed;
        throw new Error("AI response did not contain a vacancy array. Returned fields: " + (keys || "none"));
      }

      parsed = { selected: list };
      if (parsed.selected.length) break;
      if (attempt === 2) throw new Error("AI returned an empty shortlist.");
    } catch (error) {
      lastError = error;
      parsed = null;
    }
  }

  if (!parsed || !Array.isArray(parsed.selected)) {
    throw new Error("AI vacancy review failed: " + clean(lastError?.message || "The AI returned an invalid response.", 220));
  }

  const used = new Set();
  const selected = parsed.selected.slice(0, 80).map(item => {
    const rawIndex = item && (item.index ?? item.candidateIndex ?? item.candidate_index);
    const index = Number(rawIndex);

    if (!Number.isInteger(index) || index < 0 || index >= shortlist.length || used.has(index)) {
      return null;
    }

    used.add(index);

    return {
      ...candidates[index],
      matchReason: clean(item.matchReason || item.reason || "Selected based on the supplied job details.", 220),
      matchScore: Math.max(1, Math.min(100, Math.round(Number(item.matchScore ?? item.score) || 50)))
    };
  }).filter(Boolean)
    .filter(job => !isSearchOrProfilePage(job))
    .filter(job => hasIsraelEvidence(job))
    .slice(0, 30);

  if (!selected.length) {
    throw new Error("AI review found no direct individual vacancies with clear evidence of an Israel-based role. Search results and profiles were excluded.");
  }

  return selected;
}

async function inspectVacancyPage(targetUrl) {
  const response = await fetch(targetUrl, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; CareerFinderJobVerifier/1.0)",
      "Accept": "text/html,application/xhtml+xml"
    },
    signal: AbortSignal.timeout(9000)
  });
  if (response.status === 404 || response.status === 410) {
    return { open: false, reason: "Vacancy page returned HTTP " + response.status };
  }
  if (!response.ok) {
    return { open: null, reason: "Employer page could not be verified (HTTP " + response.status + ")" };
  }

  const html = (await response.text()).slice(0, 250000);
  const lower = html.toLowerCase();
  const titleMatch = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const pageTitle = clean(titleMatch ? titleMatch[1].replace(/<[^>]*>/g, " ") : "", 180);
  const visible = clean(
    html.replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'"),
    12000
  ).toLowerCase();

  const closedPatterns = [
    /this (job|position|vacancy|role|requisition) (is )?(no longer available|has been filled|is closed|has expired)/,
    /(job|position|vacancy|role) (is )?(closed|expired|filled)/,
    /no longer accepting applications/,
    /applications are now closed/,
    /this job posting has expired/,
    /the job you are looking for (is )?no longer available/,
    /we are no longer accepting applications/,
    /requisition (is )?closed/,
    /position has been filled/
  ];
  if (closedPatterns.some(pattern => pattern.test(visible))) {
    return { open: false, reason: "Employer page indicates applications are closed or the vacancy is filled" };
  }

  const structuredJob = /"@type"\s*:\s*"jobposting"/i.test(html);
  const sectionSignals = [
    /responsibilit|what you will do|what you'll do|your role|role overview/,
    /requirement|qualification|what you bring|what you'll need|what you will need/,
    /experience|skills|education|about the role|job description/
  ].filter(pattern => pattern.test(visible)).length;
  const listPage = /all (open )?(jobs|positions|vacancies)|browse (jobs|opportunities)|search (jobs|open positions)|job opportunities at|careers home/i.test(pageTitle + " " + visible.slice(0, 1200));
  const applicationPage = /\/(apply|application|submit-application)\/?$/i.test(new URL(response.url || targetUrl).pathname)
    || /application form|submit your application|candidate application/i.test(pageTitle);

  return {
    open: true,
    url: response.url || targetUrl,
    title: pageTitle,
    description: visible.slice(0, 1800),
    individual: !listPage && !applicationPage && (structuredJob || (visible.length >= 450 && sectionSignals >= 2)),
    reason: listPage
      ? "The destination appears to be a general job-listing page"
      : applicationPage
        ? "The destination appears to be an application form rather than a job description"
        : "Employer page inspected"
  };
}

async function verifyVacancyStatus(job) {
  // Prefer the vacancy description over a direct application form.
  const urls = [job.url];
  try {
    const original = new URL(job.url);
    if (/\/(apply|application|submit-application)\/?$/i.test(original.pathname)) {
      original.pathname = original.pathname.replace(/\/(apply|application|submit-application)\/?$/i, "").replace(/\/$/, "");
      urls.unshift(original.href);
    }
  } catch {}

  let lastResult = { open: null, individual: false, reason: "Could not verify employer page" };
  for (const url of [...new Set(urls)]) {
    try {
      const result = await inspectVacancyPage(url);
      if (result.open === false) return result;
      if (result.individual) return result;
      lastResult = result;
    } catch (error) {
      lastResult = { open: null, individual: false, reason: "Could not verify employer page" };
    }
  }
  return lastResult;
}

async function verifyAndLimitJobs(jobs, limit = 15) {
  const results = [];
  const seenVacancyUrls = new Set();
  for (let i = 0; i < jobs.length && results.length < limit; i += 6) {
    const batch = jobs.slice(i, i + 6);
    const checks = await Promise.all(batch.map(job => verifyVacancyStatus(job)));
    for (let j = 0; j < batch.length; j++) {
      const check = checks[j];
      // Do not show an unverified page, a general listings page, or an application-only URL.
      if (check.open !== true || check.individual !== true || !check.url) continue;
      const verifiedJob = {
        ...batch[j],
        url: check.url,
        title: check.title && check.title.length > 3 ? check.title : batch[j].title,
        description: check.description || batch[j].description,
        availabilityStatus: "Employer vacancy description checked",
        availabilityNote: "The destination contains an individual vacancy description; check the employer page for the latest application status."
      };
      if (!isIndividualVacancyURL(verifiedJob) || !hasIsraelEvidence(verifiedJob)) continue;
      const finalKey = verifiedJob.url.replace(/\/$/, "").toLowerCase();
      if (seenVacancyUrls.has(finalKey)) continue;
      seenVacancyUrls.add(finalKey);
      results.push(verifiedJob);
      if (results.length >= limit) break;
    }
  }
  return results;
}

async function search(env, body) {
  if (!env.TAVILY_API_KEY) return json({ error: "The job-search provider is not configured yet. Add TAVILY_API_KEY as a Worker secret." }, 503);
  const q = clean(body.query, 180);
  const locationInput = clean(body.location, 120);
  const location = /\bisreal\b/i.test(locationInput) ? locationInput.replace(/isreal/gi, "Israel") : locationInput;
  const experience = clean(body.experience, 40);
  const workMode = clean(body.workMode, 30);
  const cv = clean(body.cv, 9000);
  const selectedRoles = Array.isArray(body.roles) ? body.roles.slice(0, 5).map(x => clean(x, 100)).filter(Boolean) : [];
  if (!q && !location && !cv && !selectedRoles.length) return json({ error: "Enter a job title, location or CV before searching." }, 400);
  let profileSummary = "";
  let suggestions = [];
  let queries = [];
  try {
    const prompt = [
      "Create targeted job-board search queries for live vacancies. Return ONLY JSON: {searchQueries:[string], careerSuggestions:[{title:string,reason:string,searchTerms:string}]}",
      "Candidate job title/keywords: " + (q || "open to suitable roles"),
      "Location: " + (location || "anywhere"),
      "Experience level: " + (experience || "any"),
      "Work arrangement: " + (workMode || "any"),
      "CV: " + (cv || "not supplied"),
      "Already suggested roles: " + selectedRoles.join("; "),
      "Generate 8 distinct, concise queries using realistic job titles, synonyms and transferable skills. Vary the job-title wording to discover different individual vacancies, not just the same search results. Include the location and experience/work arrangement only when provided. Avoid generic advice. Suggest up to 5 adjacent job titles if a CV is supplied."
    ].join("\n");
    const raw = await askAI(env, "You are a job-search query planner. Never invent jobs or employers. Output valid JSON only.", prompt, 1100);
    const planned = extractJSON(raw);
    queries = Array.isArray(planned.searchQueries) ? planned.searchQueries.slice(0, 8).map(x => clean(x, 220)).filter(Boolean) : [];
    suggestions = Array.isArray(planned.careerSuggestions) ? planned.careerSuggestions.slice(0, 5).map(x => ({
      title: clean(x.title, 100), reason: clean(x.reason, 260), searchTerms: clean(x.searchTerms || x.title, 150)
    })).filter(x => x.title) : [];
    profileSummary = cv ? "AI used your CV and preferences to broaden the search." : "AI expanded your keywords into related job titles.";
  } catch (error) {
    queries = [q || selectedRoles.join(" ") || "jobs"];
    profileSummary = "AI query expansion was unavailable; a basic keyword search was used.";
  }
  const baseTerms = [...new Set([q, ...selectedRoles, ...suggestions.map(x => x.searchTerms)].filter(Boolean))].slice(0, 5);
  if (!queries.length) queries = baseTerms.slice(0, 4);
  const place = location ? " " + location : "";
  const mode = workMode === "remote" ? " remote" : workMode === "hybrid" ? " hybrid" : "";
  const exp = experience && experience !== "any" ? " " + experience.replace(/-/g, " ") : "";
  const boardGroups = [
    ["linkedin.com", "indeed.com", "glassdoor.com"],
    ["wellfound.com", "lever.co", "greenhouse.io", "ashbyhq.com", "smartrecruiters.com", "workable.com"],
    ["jobs.lever.co", "boards.greenhouse.io", "jobs.ashbyhq.com", "jobs.smartrecruiters.com", "apply.workable.com"],
    ["jobvite.com", "icims.com", "personio.com", "bamboohr.com", "recruitee.com", "teamtailor.com"],
    ["himalayas.app", "weworkremotely.com", "remote.co", "workingnomads.com", "jobspresso.co"],
    ["linkedin.com", "indeed.com", "glassdoor.com", "lever.co", "greenhouse.io", "smartrecruiters.com"],
    ["jobs.workday.com", "myworkdayjobs.com", "oraclecloud.com", "successfactors.com", "ultipro.com"],
    ["jobylon.com", "comeet.com", "breezy.hr", "workable.com", "ashbyhq.com"]
  ];
  const tasks = [];
  for (let i = 0; i < Math.min(queries.length, 8); i++) {
    const phrase = queries[i] + place + mode + exp + " jobs vacancies";
    const domains = boardGroups[i % boardGroups.length];
    tasks.push(tavilySearch(env.TAVILY_API_KEY, phrase, domains));
  }
  // Add a second broad search using the candidate's other role terms to widen discovery.
  const secondaryTerm = baseTerms[1] || selectedRoles[0] || suggestions[0]?.title || q || "suitable jobs";
  tasks.push(tavilySearch(env.TAVILY_API_KEY, (baseTerms[0] || q || "suitable jobs") + place + mode + exp + " jobs careers vacancies", []));
  if (secondaryTerm && secondaryTerm.toLowerCase() !== (baseTerms[0] || q || "").toLowerCase()) {
    tasks.push(tavilySearch(env.TAVILY_API_KEY, secondaryTerm + place + mode + exp + " jobs vacancies", [
      "lever.co", "greenhouse.io", "ashbyhq.com", "smartrecruiters.com", "workable.com"
    ]));
  }
  const settled = await Promise.allSettled(tasks);
  const sources = settled.map((item, index) => ({ name: index === tasks.length - 1 ? "Wider web search" : "Job-board group " + (index + 1), status: item.status === "fulfilled" ? "connected" : "unavailable" }));
  const all = settled.flatMap(item => item.status === "fulfilled" ? item.value : []);
  const seen = new Set();
  const candidates = all.filter(item => {
    try {
      const url = new URL(item.url);
      url.hash = "";
      for (const param of [...url.searchParams.keys()]) {
        if (/^(utm_|gclid$|fbclid$|ref$)/i.test(param)) url.searchParams.delete(param);
      }
      const key = url.href.replace(/\/$/, "").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      item.url = url.href;
      return true;
    } catch {
      return false;
    }
  })
    // Do not ask the AI to rank category pages or profiles as if they were jobs.
    .filter(item => !isSearchOrProfilePage(item))
    .filter(item => isIndividualVacancyURL(item))
    .filter(item => hasIsraelEvidence(item))
    .sort((a, b) => b.score - a.score)
    .slice(0, 80);
  let jobs;
  try {
    const aiRankedJobs = await selectTopJobs(env, candidates, {
      query: q, location, experience, workMode, cv: cv.slice(0, 3500), savedCareerRoles: selectedRoles
    });
    jobs = await verifyAndLimitJobs(aiRankedJobs, 15);
  } catch (error) {
    return json({ error: "Search results were found, but the vacancy review could not be completed. " + clean(error.message, 180) }, 502);
  }
  const usedFallback = jobs.length > 0 && jobs[0].matchReason && jobs[0].matchReason.startsWith("Ranked using");
  return json({
    jobs, total: jobs.length, candidatesReviewed: candidates.length, sources,
    generatedAt: new Date().toISOString(),
    profileSummary: usedFallback
      ? "The AI review service was temporarily unavailable, so CareerFinder ranked the collected vacancies using your keywords and job details."
      : "AI reviewed " + candidates.length + " individual vacancy candidates, checked employer pages for closure notices, and selected up to 15 suitable jobs.",
    careerSuggestions: [], searchQueries: []
  });
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (origin && origin !== "https://tovi-donninger.github.io" && !origin.startsWith("http://localhost:")) return json({ error: "Origin not allowed." }, 403);
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") return json({ status: "online", service: "CareerFinder AI job search", endpoints: ["/api/analyse", "/api/search"] });
    if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON request." }, 400); }
    if (url.pathname === "/api/analyse") return analyse(env, body);
    if (url.pathname === "/api/search") return search(env, body);
    return json({ error: "Not found." }, 404);
  }
};