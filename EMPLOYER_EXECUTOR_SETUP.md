# Employer application executor — local prototype

The browser runner lives at `scripts/employer-form-executor.mjs`. It is **not connected to Cloudflare's automatic queue**. It must be run on a trusted computer with Node.js 22+ and a browser. LinkedIn and Indeed are discovery channels; use the identical vacancy on the employer's official site.

## Install

```bash
npm install --no-save playwright
npx playwright install chromium
```

## Private input

Create a file named `private-application.json` **only on your own computer** (never commit it):

```json
{
  "job": {"url":"https://employer.example/jobs/exact-vacancy","title":"Exact title","company":"Employer"},
  "profile": {"firstName":"Your first name","lastName":"Your last name","email":"you@example.com","phone":"","linkedin":""},
  "cvFile":"/absolute/path/to/your-cv.pdf",
  "verifiedZeroExperience":true,
  "verifiedEnglish":true,
  "verifiedIsraelEligibility":true,
  "confirmedOpen":true
}
```

The four verification flags are **assertions supplied by the operator**; this prototype does not independently verify the job posting. Do not set them true without checking employer evidence. Use the employer's exact vacancy page, not a job board or generic careers page.

## Run

```bash
node scripts/employer-form-executor.mjs --application private-application.json --visible
```

This prepares the form and saves a screenshot and JSON record under `application-receipts/`, without submitting.

For an application you have individually reviewed and explicitly authorized:

```bash
node scripts/employer-form-executor.mjs --application private-application.json --visible --submit --confirm-authorized
```

**Limitations:** The runner currently supports common text fields and the first file input only; it does not complete employer-specific screening questions, custom widgets, authentication, consent, multi-step flows or CAPTCHA. It does not integrate with the Cloudflare application queue, verify a confirmation with an external provider, or update the live Submitted dashboard. A positive confirmation is recorded locally only when recognized on the employer page. Avoid rerunning a potentially submitted application until its status has been checked, to prevent duplicates. Do not share application JSON or screenshots.

Next engineering tasks: authenticated one-time job handoff, signed receipt ingestion, employer-specific form adapters, verified source-to-employer matching, rate limits, retries with idempotency, and a hosted browser runtime with secure private-document storage. These are not implemented yet.
