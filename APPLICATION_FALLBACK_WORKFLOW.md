# CareerFinder application fallback workflow

1. Discover the exact vacancy from LinkedIn, Indeed or another source.
2. Apply all hard eligibility gates: explicit zero prior experience required; English sufficient; Israel/on-site or remote-from-Israel eligibility; vacancy confirmed open; minimum match score.
3. Prefer a permitted direct submission integration when available.
4. If LinkedIn or Indeed submission is unavailable, locate the **identical vacancy** on the employer's official careers website or employer-linked ATS. Verify employer, exact title, location and requisition ID where available; never substitute a different job.
5. Only a user-authorized, permitted application workflow may populate employer forms, upload the private CV and cover letter, answer questions truthfully, and submit. Never circumvent CAPTCHA, access controls or anti-bot restrictions.
6. Pause for the user if a site needs authentication, identity verification, CAPTCHA, consent, subjective answers, or a review/approval step not explicitly authorized.
7. Save a real provider receipt or submission confirmation before marking Submitted. If the page does not confirm submission, retain Needs review / Blocked.
8. Keep profile and CV private in Cloudflare D1. Never store them in the public GitHub repository.

Current implementation: source routing and queue are connected; **no authorized browser automation or submission adapter is configured**, so this workflow is a specification, not a claim of successful submissions.
