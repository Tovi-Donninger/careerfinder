# CareerFinder

A free, universal AI-assisted job-search and career-discovery website.

## Product workflow

1. A user enters job keywords, location, experience level and work arrangement.
2. A user can paste a CV or load a plain-text CV.
3. Cloudflare Workers AI analyses the CV, identifies skills and education, and recommends adjacent career paths.
4. The AI turns the candidate's background and preferences into targeted job-search queries.
5. The backend searches public web results across LinkedIn, Indeed, Glassdoor, Wellfound, employer ATS pages (Greenhouse, Lever, Ashby, SmartRecruiters and Workable), and remote-job sites.
6. CareerFinder displays the discovered vacancy links and snippets. Users open the original website and apply themselves.

CareerFinder does not scrape logged-in job-board pages, submit applications, or claim that every indexed vacancy is still open.

## Backend setup (required for AI search)

The website is hosted on GitHub Pages. The AI and search work happens in the existing Cloudflare Worker:

`https://careerfinder-search.tovidonninger.workers.dev/`

### Providers selected

- **Cloudflare Workers AI** for CV analysis and AI search-query planning. Its current Free plan includes 10,000 Neurons per day. Some models or usage above the free allowance may require a paid plan.
- **Tavily Search API** for retrieving live web search results. Its free Researcher plan currently includes 1,000 API credits per month and does not require a credit card. CareerFinder makes up to four basic search requests per search, so the free allowance supports approximately 250 full searches per month before it is exhausted. Requests stop when credits are exhausted; no paid upgrade is required.

Provider limits and terms can change. This is a free-tier service, not an unlimited-search guarantee.

### Configure the Cloudflare Worker

1. Sign in to Cloudflare and open **Workers & Pages**.
2. Select the existing Worker named **careerfinder-search**.
3. Open **Edit code** and replace the Worker code with the complete contents of `worker.js` in this repository. Deploy the change.
4. In the Worker settings, open **Bindings** and add a **Workers AI** binding with the variable name `AI`.
5. Create a free Tavily account at https://www.tavily.com/ and copy the API key.
6. In the Worker, open **Settings → Variables and Secrets**. Add a secret named `TAVILY_API_KEY` and paste the Tavily key. Never put this key in `app.js` or any public website file.
7. Save and deploy the Worker again.

The Worker exposes:
- `POST /api/analyse` — AI CV analysis and career suggestions.
- `POST /api/search` — AI query planning plus multi-site web search.
- `GET /` — service health check.

The frontend uses the deployed Worker URL in `app.js`.

## Free usage and privacy

- GitHub Pages and the Cloudflare Worker have free usage allowances, subject to their current platform limits.
- Cloudflare Workers AI currently includes 10,000 Neurons per day on the Free plan.
- Tavily currently includes 1,000 search credits per month on its free plan. A typical CareerFinder search uses up to four basic search credits.
- When a user selects **Analyse my experience** or **Search jobs**, their CV text is sent to the CareerFinder Worker and processed by Cloudflare Workers AI. The Worker does not save a server-side CV profile. The browser stores the user's CV locally in localStorage for this prototype.
- Do not include highly sensitive identifiers in a CV submitted to the AI feature. Users can clear the saved browser data by clearing the site's local storage.
- Search queries and results are sent to Tavily. Do not send private contact details as search terms.

## Current limitations

- The first CV upload supports pasted text and `.txt` files. PDF and Word text extraction is not yet implemented.
- Search engines may return expired, duplicate, incomplete or non-vacancy pages. Users must verify each result on the original site.
- Job-board coverage and indexing vary by country, role and website. Search results are not a complete inventory of vacancies.
- Location and employer details may be missing from search snippets; open the original listing to confirm.
- Free AI and search allowances are shared across all CareerFinder users. The backend currently has no user accounts or per-user quota dashboard, so usage must be monitored in Cloudflare and Tavily.
- Do not scrape sites or bypass access controls. CareerFinder uses search-provider results and links users to the original pages.

## Run locally

Open `index.html` directly or serve the repository folder with a static web server. The deployed Cloudflare Worker currently allows the published GitHub Pages origin. For local testing, update its CORS allowlist to include your local development origin.

## Publish with GitHub Pages

Use **Settings → Pages → Deploy from a branch → main → /(root)**.

## Product principles

- Free to use; never silently switch users to paid services.
- Universal job-search criteria, not hard-coded candidate preferences.
- AI recommendations must be explainable and grounded in the CV.
- Users apply directly on the original job website.
- Respect website terms, robots policies and search-provider rate limits.
