# ChatGPT recruitment inbox

This folder is a bridge between ChatGPT's scheduled **Daily Job Search** and the private CareerFinder D1 dashboard.

The automation can create a new file named `jobs-YYYY-MM-DD.json` (or `jobs-YYYY-MM-DD-2.json` for an additional batch) in this **public GitHub repository**. A GitHub Action imports the records into the private Cloudflare D1 database. The CareerFinder **Job discoveries → Refresh findings** button reads them after import.

**Never put your CV, email address, phone number, login credentials, cover letters, private correspondence, or application details here.** This folder is public. Only publicly advertised vacancy information is allowed.

Example schema:

```json
{
  "jobs": [
    {
      "title": "Recruitment Coordinator",
      "company": "Example Employer",
      "url": "https://example.org/jobs/123",
      "location": "Tel Aviv, Israel",
      "workArrangement": "On-site",
      "employmentType": "Full-time",
      "salary": "Not disclosed",
      "matchScore": 82,
      "matchReason": "HR education and relevant coordination experience",
      "languageEvidence": "English advert; working language not confirmed",
      "eligibilityEvidence": "Experience requirements not stated; confirm",
      "verificationStatus": "Vacancy page checked; accepting applications not confirmed",
      "source": "Employer vacancy page"
    }
  ]
}
```

Use a real direct HTTPS vacancy URL, not a search results page. Never fabricate evidence or mark a role verified without checking it. Include no more than 50 jobs per file. Jobs are deduplicated by URL. This bridge stores discoveries only, not submitted applications.

**Important:** This GitHub bridge is operational only when the scheduled ChatGPT automation can access its GitHub connector and commit a file. The GitHub Action cannot itself make ChatGPT search; check the scheduled run's output to confirm it actually wrote the file.
