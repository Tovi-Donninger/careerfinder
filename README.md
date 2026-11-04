# CareerFinder

A free, universal job-search and career-discovery workspace.

## Current prototype (0.1.0)

- Search live listings from three free public feeds: Arbeitnow (five pages), Jobicy (up to 200 remote listings) and Remotive (cached to respect its low request frequency).\n- Cache feed responses in the browser to reduce repeated API calls.\n- Filter listings by keywords, location, experience level and work arrangement, then deduplicate by original listing URL.\n- Open pre-filled searches on LinkedIn, Indeed, Glassdoor and other job boards, plus targeted Google searches for employer vacancies hosted on Greenhouse, Lever, Ashby, Workable and SmartRecruiters. These external searches are not imported into CareerFinder.
- Paste CV/experience text or load a plain-text `.txt` CV.
- Get transparent keyword-based career suggestions and save promising directions.
- Track jobs, application links and statuses.
- Store prototype data in the current browser using localStorage.

## Run locally

This is a static browser application. Open `index.html` directly, or serve the folder with any static web server. No build step or package installation is required.

## Publish with GitHub Pages

1. Open the repository's **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Choose branch **main** and folder **/(root)**, then save.
4. Wait for GitHub Pages to publish the site. The Pages URL will appear in Settings → Pages.

## Important limitations

This is an early prototype, not a production job-search service yet.

- The three connected feeds do not cover the whole job market and are not a replacement for LinkedIn, Indeed or Glassdoor. Those platforms open in separate tabs using pre-filled searches; their individual vacancies are not imported or tracked automatically inside CareerFinder.\n- Employer ATS discovery uses Google search links. It does not crawl or continuously monitor every company career page.\n- Job-feed availability and browser CORS policies can change. Failed feeds are skipped; no vacancy is guaranteed to be current or still open. The user should verify each vacancy on the employer website.\n- Remotive requests are cached for six hours to reduce calls; other feeds are cached for one hour. Browser-local caching is per device/browser, not a central shared cache.
- Job-feed coverage, location fields, freshness and cross-border eligibility vary. Always confirm vacancies on the employer's own website.
- CV matching is keyword-based, not an AI hiring prediction.
- The first version accepts pasted text or `.txt` files; it does not extract PDF or Word files.
- Data is stored only in this browser. There are no accounts, cloud sync or cross-device application records yet.
- Do not use a shared device for private CV information. Clear this browser's site data to remove prototype data.

## Product principles

- Free to use, with no paid AI API required for the prototype.
- Universal settings rather than hard-coded career preferences.
- Private candidate data; future cloud features must enforce per-user access and deletion.
- Respect job-board terms, robots policies and source rate limits. Do not scrape sites where access is prohibited.

## Planned development

1. Secure authentication and per-user cloud storage.
2. PDF and DOCX CV text extraction, with private/deletable documents.
3. Stronger skills and transferable-career matching, with an explainable non-AI fallback.
4. More permitted job sources, employer career feeds and user-submitted listings.
5. Deduplication, freshness checks, filters and international job eligibility.
6. Application notes, reminders, export and cross-device sync.

CareerFinder aims to remain free. Hosting, data-source and service limits will be documented honestly; unlimited third-party search or AI usage cannot be promised without a sustainable free provider.
