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
  const text = String(value || "").replace(/^﻿/, "").trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The AI returned an unexpected response.");
  return JSON.parse(match[0]);
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
    max_results: 8, include_answer: false, include_raw_content: false
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
    description: clean(item.content, 650),
    url: item.url,
    score: Number(item.score || 0),
    source: (() => { try { return new URL(item.url).hostname.replace(/^www\./, ""); } catch { return "Web search"; } })(),
    sourceUrl: item.url,
    foundAt: new Date().toISOString()
  })).filter(x => x.title && x.url && /^https?:\/\//i.test(x.url));
}
async function search(env, body) {
  if (!env.TAVILY_API_KEY) return json({ error: "The job-search provider is not configured yet. Add TAVILY_API_KEY as a Worker secret." }, 503);
  const q = clean(body.query, 180);
  const location = clean(body.location, 120);
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
      "Generate up to 4 concise queries using realistic job titles, synonyms and transferable skills. Include the location and experience/work arrangement only when provided. Avoid generic advice. Suggest up to 5 adjacent job titles if a CV is supplied."
    ].join("\n");
    const raw = await askAI(env, "You are a job-search query planner. Never invent jobs or employers. Output valid JSON only.", prompt, 1100);
    const planned = extractJSON(raw);
    queries = Array.isArray(planned.searchQueries) ? planned.searchQueries.slice(0, 4).map(x => clean(x, 220)).filter(Boolean) : [];
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
    ["himalayas.app", "weworkremotely.com", "remote.co", "workingnomads.com", "jobspresso.co"]
  ];
  const tasks = [];
  for (let i = 0; i < Math.min(queries.length, 3); i++) {
    const phrase = queries[i] + place + mode + exp + " jobs vacancies";
    const domains = boardGroups[i % boardGroups.length];
    tasks.push(tavilySearch(env.TAVILY_API_KEY, phrase, domains));
  }
  tasks.push(tavilySearch(env.TAVILY_API_KEY, (baseTerms[0] || q || "suitable jobs") + place + mode + exp + " jobs careers vacancies", []));
  const settled = await Promise.allSettled(tasks);
  const sources = settled.map((item, index) => ({ name: index === tasks.length - 1 ? "Wider web search" : "Job-board group " + (index + 1), status: item.status === "fulfilled" ? "connected" : "unavailable" }));
  const all = settled.flatMap(item => item.status === "fulfilled" ? item.value : []);
  const seen = new Set();
  const jobs = all.filter(item => {
    try {
      const url = new URL(item.url); url.hash = "";
      for (const param of [...url.searchParams.keys()]) {
        if (/^(utm_|gclid$|fbclid$|ref$)/i.test(param)) url.searchParams.delete(param);
      }
      const key = url.href.replace(/\/$/, "").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key); item.url = url.href; return true;
    } catch { return false; }
  }).sort((a, b) => b.score - a.score).slice(0, 40);
  return json({ jobs, total: jobs.length, sources, generatedAt: new Date().toISOString(), profileSummary, careerSuggestions: suggestions, searchQueries: queries });
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