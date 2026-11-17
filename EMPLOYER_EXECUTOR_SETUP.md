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


## Authenticated CareerFinder handoff (new)

After signing in, obtain your temporary 12-hour session token securely. Do not put it in a command history or share it with anyone. On your own computer, set the environment variable `CAREERFINDER_SESSION_TOKEN` through a secure shell mechanism and run:

```bash
node scripts/fetch-application-handoff.mjs JOB_ID /absolute/path/to/your-cv.pdf
node scripts/employer-form-executor.mjs --application private-application-JOB_ID.json --visible
```

The handoff requires the job to exist in the private D1 recruitment database and pass the current eligibility screening. Jobs discovered only on LinkedIn or Indeed must first be matched to their identical employer-side posting and stored with that exact URL. The CV file must already exist on the local computer.

This integration is a **manual authenticated handoff**, not a hosted scheduled executor. The prototype does not upload receipts to D1 or mark jobs submitted in the dashboard. Submission remains a separately authorized command, and no production browser runner is deployed.

**Security note:** The handoff includes private profile data and must be kept on a trusted device; delete the local JSON and screenshots when no longer needed. The current eligibility evidence is recorded screening data, not an independent live check of the employer posting.


## Upload browser receipts to private CareerFinder (new)

After a local browser run, use the same private 12-hour session token to upload the JSON receipt. The original handoff's `jobId` is required:

```bash
node scripts/upload-application-receipt.mjs application-receipts/RECEIPT_ID.json JOB_ID
```

This calls the authenticated `/api/private/recruitment/application-executor/receipt` endpoint. Receipts are stored in `recruitment_application_receipts` as **Pending review** and may be viewed via `GET /api/private/recruitment/application-executor/receipts`. Uploading a receipt **does not mark the job Submitted** and does not increase the confirmed-submissions count.

The Cloudflare deployment workflow now applies `migrations/0005_application_receipts.sql`. Deployment and end-to-end testing remain unverified. The browser executor is still local; there is no deployed browser worker, automated employer form submission service, or independently verified receipt ingestion. Do not use this to claim automatic submissions are live.
