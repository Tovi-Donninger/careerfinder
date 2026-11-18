# CareerFinder recruitment and automatic-application eligibility rules

## Experience requirement, by role category
Each job carries a `roleCategory`: `hr_recruitment`, `admin_ops`, `sales` (SDR/BDR/inside sales) or `customer_success`. This is a hard eligibility gate, not a scoring preference.

- **HR / recruitment** (`hr_recruitment`, or no `roleCategory` given): **zero previous professional experience** is required, with explicit evidence. Nothing below relaxes this.
- **Office support / admin / operations, sales and customer success** (`admin_ops`, `sales`, `customer_success`): zero experience is accepted, and so is a requirement of **at most 1 year**. The evidence must state it explicitly (for example "0-1 years", "up to 1 year", "1 year of experience", "1+ years", "at least one year", "6 months"). Reject anything above 1 year: "1-2 years", "2+ years", "minimum two years", more than 12 months, "several years". "1+ years" and "at least one year" are allowed because the mandatory minimum is one year.
- An unknown `roleCategory` value is rejected. Evidence without a clear experience statement is rejected (fail closed).
- The category is stored as a `[role:<category>] ` prefix on the stored evidence text, so no schema change is needed. HR evidence is stored unprefixed.

### Zero-experience rules (apply to HR/recruitment, and are always accepted for the other categories)

- Accept vacancies that explicitly say no prior experience is required, no experience necessary, training provided with no experience required, or explicitly welcome candidates without work experience.
- For HR/recruitment, reject vacancies requiring 1+ years in any job function, industry, sales environment, SaaS, or other professional capacity, even if labelled junior, graduate or entry level.
- Reject vacancies where the experience requirement cannot be verified from the employer's vacancy posting. Do not infer that entry-level or junior means zero experience.
- Capture the exact evidence (quoted from the employer's posting) and its HTTPS source URL for the experience requirement in the job record.
- The same category rule is applied when saving discoveries, importing the recruitment inbox, building handoffs and checking the employer page before a browser application.
- Do not queue or automatically submit an application unless this requirement and all other eligibility gates are satisfied.
- Existing experience may improve fit but must never override a required-experience exclusion.
- Continue to require explicit English-language eligibility and Israel/on-site or genuinely remote-from-Israel eligibility, and permitted submission channels.
- Never represent a discovered or queued job as an application submitted. Require external submission confirmation.

This document is the authoritative hard filter for CareerFinder discovery, matching and future application automation.

## Grok Bot discoveries and the application pipeline

`POST /api/private/recruitment/jobs` (discovery key) accepts an optional per-job boolean `queueForApplication`.

- Absent or `false`: the job is saved and **held** (an Application queue row with status `Needs review`, provider `grok-hold`), so the scheduled browser pipeline never applies to it.
- `true`: the job must pass the pipeline gates (match score ≥ 85, verification status "Confirmed open"/"accepting applications", English confirmed, Israel eligibility confirmed, Israel location or stated eligibility from Israel, employer URL rather than LinkedIn/Indeed, not flagged for Tovi). It is then **released**: any earlier Grok hold is removed and `application-executor/next` can select it.
- Re-posting an existing URL updates its match reason, verification status and experience evidence.
- Anything that needs Tovi is marked on the dashboard with "Needs your attention": a verification status of `needs_review`, a match reason starting `NEEDS TOVI:`, a blocked handoff, or a browser run that held the form or reports a submission.
