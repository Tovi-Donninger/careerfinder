const cors = {
  "Access-Control-Allow-Origin": "https://tovi-donninger.github.io",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function clean(value, max = 12000) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function extractJSON(value) {
  const source = String(value || "").trim().replace(/^\s*\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`\s*$/, "");
  try { return JSON.parse(source); } catch {}
  const start = source.indexOf("{");
  if (start < 0) throw new Error("AI did not return JSON.");
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(source.slice(start, i + 1));
  }
  throw new Error("AI returned incomplete JSON.");
}

async function askAI(env, system, user, maxTokens = 1800) {
  if (!env.AI) throw new Error("Cloudflare Workers AI is not connected.");
  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    max_tokens: maxTokens,
    temperature: 0.1
  });
  return result.response || result.result?.response || "";
}

async function analyse(env, body) {
  const cv = clean(body.cv, 12000);
  if (cv.length < 40) return json({ error: "Please provide at least a few sentences from your CV." }, 400);
  const system = "You are a practical career coach. Analyse CV text accurately. Never invent qualifications, employers, years of experience or skills. Identify transferable skills and realistic adjacent roles. Return ONLY valid JSON with keys: profileSummary (string), keySkills (array), education (array), careerSuggestions (array of objects with title, reason, level, searchTerms). Give 6 to 8 suggestions. Do not assume a country, language or work arrangement.";
  try {
    const result = extractJSON(await askAI(env, system, "Analyse this CV:\n" + cv, 1500));
    return json({
      profileSummary: clean(result.profileSummary, 900),
      keySkills: Array.isArray(result.keySkills) ? result.keySkills.slice(0, 12).map(x => clean(x, 80)) : [],
      education: Array.isArray(result.education) ? result.education.slice(0, 6).map(x => clean(x, 120)) : [],
      careerSuggestions: Array.isArray(result.careerSuggestions) ? result.careerSuggestions.slice(0, 8).map(x => ({
        title: clean(x.title, 100), reason: clean(x.reason, 320),
        level: clean(x.level, 60), searchTerms: clean(x.searchTerms || x.title, 150)
      })).filter(x => x.title) : []
    });
  } catch (error) {
    return json({ error: clean(error.message || "CV analysis failed.", 220) }, 502);
  }
}

async function tavilySearch(key, query, domains) {
  const payload = {
    api_key: key,
    query,
    search_depth: "advanced",
    topic: "general",
    max_results: 20,
    include_answer: false,
    include_raw_content: true
  };
  if (domains && domains.length) payload.include_domains = domains;
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error("Search provider returned HTTP " + response.status);
  const data = await response.json();
  return (data.results || []).map(item => ({
    title: clean(item.title, 200),
    description: clean(item.raw_content || item.content, 1400),
    url: item.url,
    score: Number(item.score || 0),
    source: (() => {
      try { return new URL(item.url).hostname.replace(/^www\./, ""); }
      catch { return "Job website"; }
    })()
  })).filter(item => item.title && item.url && /^https?:\/\//i.test(item.url));
}

function uniqueResults(results) {
  const seen = new Set();
  return results.filter(item => {
    try {
      const url = new URL(item.url);
      url.hash = "";
      for (const key of [...url.searchParams.keys()]) {
        if (/^(utm_|gclid$|fbclid$|ref$)/i.test(key)) url.searchParams.delete(key);
      }
      const key = url.href.replace(/\/$/, "").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      item.url = url.href;
      return true;
    } catch { return false; }
  }).sort((a, b) => b.score - a.score);
}

async function planSearches(env, body, location) {
  const prompt = [
    "Create three different web search queries to find actual individual job advertisements, not job-search pages.",
    "Job sought: " + (clean(body.query, 180) || "suitable entry-level roles"),
    "Location: " + (location || "Israel"),
    "Experience: " + (body.experience || "entry-level or junior"),
    "Work arrangement: " + (body.workMode || "any"),
    "Candidate CV: " + clean(body.cv, 1800),
    "Saved career directions: " + (Array.isArray(body.roles) ? body.roles.slice(0, 5).join("; ") : ""),
    "For Israel roles, favour full-time vacancies where English is sufficient and Hebrew is not stated as mandatory. Use realistic title synonyms. Return ONLY JSON: {\"searchQueries\":[\"...\",\"...\",\"...\"]}"
  ].join("\n");
  try {
    const data = extractJSON(await askAI(env, "You are a job-search query planner. Return valid JSON only.", prompt, 700));
    const queries = Array.isArray(data.searchQueries) ? data.searchQueries.slice(0, 3).map(x => clean(x, 220)).filter(Boolean) : [];
    if (queries.length) return queries;
  } catch {}
  const q = clean(body.query, 160) || "entry level office administrator";
  const level = body.experience && body.experience !== "any" ? body.experience.replace(/-/g, " ") : "junior entry level";
  return [
    q + " " + location + " " + level + " full time English",
    q + " coordinator assistant administrator " + location + " English speaking",
    q + " vacancies employer careers " + location + " full time"
  ];
}

function isDirectoryOrSearchPage(job) {
  let parsed;
  try { parsed = new URL(job.url); } catch { return true; }
  const path = decodeURIComponent(parsed.pathname || "").toLowerCase();
  const title = clean(job.title, 200).toLowerCase();
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

  // Known category/directory URL patterns, not individual vacancy pages.
  if (/\/jobs?\/(in-|category|categories|search|browse|by-)/i.test(path)) return true;
  if (/\/(search|job-search|jobs-search|vacancy-search|browse-jobs)(\/|$)/i.test(path)) return true;
  if (host === "untalent.org" && /^\/jobs?\//i.test(path)) return true;

  // Reject generic page titles that describe collections rather than one role.
  const genericTitles = [
    /^jobs? in .+/,
    /^.+ jobs? in .+/,
    /^.+ vacancies in .+/,
    /^.+ job vacancies$/,
    /^all .+ jobs?$/,
    /^search (for )?jobs?$/,
    /^browse (all )?jobs?$/,
    /^job listings?$/,
    /^career opportunities$/,
    /^latest jobs?$/,
    /^find jobs?$/
  ];
  if (genericTitles.some(pattern => pattern.test(title))) return true;
  return false;
}

async function reviewVacancyBatch(env, candidates, criteria, offset) {
  const records = candidates.map((job, index) => ({
    index,
    title: job.title,
    website: job.source,
    url: job.url,
    details: job.description.slice(0, 520)
  }));
  const system = [
    "You shortlist genuine individual job advertisements. Use only the supplied records; never invent facts or URLs.",
    "Reject search/category pages, directories, profiles, articles, company homepages and pages covering multiple jobs. Keep only one specific vacancy with a direct job link.",
    "The job must be in the requested location. For Israel, reject only if Hebrew is explicitly mandatory; otherwise say whether language requirements are stated or not stated. Prefer English-friendly full-time jobs.",
    "Follow the requested experience level. Prefer junior, assistant, coordinator, administrator and entry-level roles when relevant.",
    "Reject only listings explicitly marked closed, expired, filled or no longer accepting applications. If unclear, use 'Not confirmed'.",
    "Return at most 8 strong matches, ranked best first. Do not pad. Copy the exact input index.",
    "Return ONLY JSON: {\"selected\":[{\"index\":0,\"company\":\"...\",\"location\":\"...\",\"matchReason\":\"...\",\"matchScore\":80,\"languageStatus\":\"Not stated\",\"availabilityStatus\":\"Not confirmed\"}]}. Use empty strings for unknown company/location."
  ].join(" ");
  const prompt = "Criteria: " + JSON.stringify(criteria) + "\nVacancy search records:\n" + JSON.stringify(records) +
    "\nSelect genuine matching vacancies only. Use the exact indexes shown.";
  const parsed = extractJSON(await askAI(env, system, prompt, 1100));
  const selected = Array.isArray(parsed) ? parsed : parsed.selected;
  if (!Array.isArray(selected)) throw new Error("AI did not return a shortlist.");
  const used = new Set();
  return selected.slice(0, 8).map(item => {
    const index = Number(item.index);
    if (!Number.isInteger(index) || index < 0 || index >= records.length || used.has(index)) return null;
    used.add(index);
    const job = candidates[index];
    const availability = clean(item.availabilityStatus, 50) || "Not confirmed";
    if (/closed|expired|filled|no longer/i.test(availability)) return null;
    return {
      title: job.title,
      company: clean(item.company, 120),
      location: clean(item.location, 120),
      description: job.description.slice(0, 420),
      url: job.url,
      source: job.source,
      matchReason: clean(item.matchReason, 220) || "Selected by AI based on the vacancy details.",
      matchScore: Math.max(1, Math.min(100, Math.round(Number(item.matchScore) || 50))),
      languageStatus: clean(item.languageStatus, 90) || "Not stated",
      availabilityStatus: availability,
      _order: offset + index
    };
  }).filter(Boolean);
}

async function reviewVacancies(env, candidates, criteria) {
  const batches = [];
  for (let i = 0; i < candidates.length; i += 8) {
    batches.push({ jobs: candidates.slice(i, i + 8), offset: i });
  }
  const results = await Promise.allSettled(
    batches.map(batch => reviewVacancyBatch(env, batch.jobs, criteria, batch.offset))
  );
  const selected = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
  if (!selected.length) {
    const failure = results.find(result => result.status === "rejected");
    throw new Error(failure ? clean(failure.reason?.message || failure.reason, 180) : "No genuine vacancies passed the AI review.");
  }
  return selected.sort((a, b) => b.matchScore - a.matchScore).slice(0, 15).map(({_order, ...job}) => job);
}
async function search(env, body) {
  if (!env.TAVILY_API_KEY) return json({ error: "Job search is not configured. Add the TAVILY_API_KEY Worker secret." }, 503);
  const query = clean(body.query, 180);
  const requestedLocation = clean(body.location, 120);
  const location = !requestedLocation || /^isreal$/i.test(requestedLocation) ? "Israel" : requestedLocation;
  const experience = clean(body.experience, 40) || "any";
  const workMode = clean(body.workMode, 30) || "any";
  const cv = clean(body.cv, 9000);
  const roles = Array.isArray(body.roles) ? body.roles.slice(0, 5).map(x => clean(x, 100)).filter(Boolean) : [];
  if (!query && !cv && !roles.length) return json({ error: "Enter a job title, location or CV before searching." }, 400);

  const queries = await planSearches(env, body, location);
  const base = queries[0] + " " + location;
  const tasks = [
    tavilySearch(env.TAVILY_API_KEY, base, null),
    tavilySearch(env.TAVILY_API_KEY, queries[1] || (query + " assistant coordinator " + location), null),
    tavilySearch(env.TAVILY_API_KEY, queries[2] || (query + " full time English " + location), null),
    tavilySearch(env.TAVILY_API_KEY, "site:linkedin.com/jobs/view OR site:indeed.com/viewjob OR site:glassdoor.com/job-listing " + (query || roles.join(" ")) + " " + location, null),
    tavilySearch(env.TAVILY_API_KEY, "site:jobs.lever.co OR site:boards.greenhouse.io OR site:jobs.ashbyhq.com OR site:jobs.smartrecruiters.com " + (query || roles.join(" ")) + " " + location, null)
  ];
  const settled = await Promise.allSettled(tasks);
  const results = settled.flatMap(item => item.status === "fulfilled" ? item.value : []);
  const candidates = uniqueResults(results).filter(job => !isDirectoryOrSearchPage(job)).slice(0, 24);
  if (!candidates.length) {
    return json({
      jobs: [], total: 0, candidatesReviewed: 0,
      profileSummary: "The search provider did not return any usable job pages. Try a broader job title.",
      sources: settled.map((item, i) => ({ name: "Search " + (i + 1), status: item.status === "fulfilled" ? "connected" : "unavailable" }))
    });
  }

  try {
    const jobs = await reviewVacancies(env, candidates, {
      query, location, experience, workMode, cv: cv.slice(0, 2500), savedCareerRoles: roles,
      requirements: location.toLowerCase().includes("israel")
        ? "Full-time preferred. English-speaking. Hebrew must not be mandatory. Junior/entry-level if selected in experience field."
        : "Follow the location and experience criteria supplied."
    });
    return json({
      jobs,
      total: jobs.length,
      candidatesReviewed: candidates.length,
      profileSummary: "AI reviewed " + candidates.length + " individual vacancy pages and shortlisted " + jobs.length + " relevant vacancies. Directory and search-result pages were excluded. Application status is marked only where the listing provides clear evidence.",
      sources: settled.map((item, i) => ({ name: "Search " + (i + 1), status: item.status === "fulfilled" ? "connected" : "unavailable" })),
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    return json({ error: "AI could not complete the vacancy review: " + clean(error.message, 220) }, 502);
  }
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      const origin = request.headers.get("Origin") || "";
      if (origin && origin !== "https://tovi-donninger.github.io" && !origin.startsWith("http://localhost:")) {
        return json({ error: "Origin not allowed." }, 403);
      }
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/") {
        return json({ status: "online", service: "CareerFinder AI job search", endpoints: ["/api/analyse", "/api/search"] });
      }
      if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
      let body;
      try { body = await request.json(); }
      catch { return json({ error: "Invalid JSON request." }, 400); }
      if (url.pathname === "/api/analyse") return await analyse(env, body);
      if (url.pathname === "/api/search") return await search(env, body);
      return json({ error: "Not found." }, 404);
    } catch (error) {
      return json({ error: "Worker request failed: " + clean(error.message || error, 260) }, 500);
    }
  }
};