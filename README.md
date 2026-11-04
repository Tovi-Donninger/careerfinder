# CareerFinder

A free, universal job-search and career-discovery workspace.

## Current prototype (0.1.0)

- Search live listings from Arbeitnow and Jobicy public feeds, plus optional employer boards using the Greenhouse Job Board API and Ashby's public Job Postings API.\n- Connect up to 15 Greenhouse board tokens and 15 Ashby board names in the search page; identifiers are stored in this browser only.\n- Cache feed responses in the browser for one hour to reduce repeat requests.\n- Filter listings by keywords, location, experience level and work arrangement, then deduplicate by canonical listing URL.\n- Generate targeted searches across LinkedIn, Indeed, Glassdoor, Himalayas, Wellfound, We Work Remotely, Working Nomads, Jobspresso, Remote.co and JustRemote.
- Generate Google site-restricted searches for individual indexed job-post pages on LinkedIn, Glassdoor, Indeed and other job boards, plus employer vacancies hosted on Greenhouse, Lever, Ashby, Workable and SmartRecruiters. Provide Bing alternatives for key indexed searches. These links open the search engine results; they are not imported vacancy records.
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

- Job sources do not cover the whole job market. LinkedIn, Indeed, Glassdoor and other external boards open in separate tabs using pre-filled searches. Google/Bing site-restricted links help locate publicly indexed individual vacancy pages, but search-engine results are not retrieved into CareerFinder or verified automatically.\n- Greenhouse and Ashby connectors require the user to supply the employer's public board token/name. They do not discover every employer automatically.\n- Lever's public postings API does not support cross-origin requests from unrelated domains, so it is not imported directly by this static browser app.\n- Job-feed availability, API policies and browser CORS rules can change. Failed sources are skipped and counted; users should verify every vacancy on the employer website. A published listing is not proof that a vacancy is still accepting applications.\n- Browser-local caching is per device/browser, not a central shared cache.
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
4. More permitted job sources, employer career feeds and user-submitted listings, including a secure proxy for APIs that do not permit browser cross-origin requests.
5. Deduplication, freshness checks, filters and international job eligibility.
6. Application notes, reminders, export and cross-device sync.

CareerFinder aims to remain free. Hosting, data-source and service limits will be documented honestly; unlimited third-party search or AI usage cannot be promised without a sustainable free provider.
