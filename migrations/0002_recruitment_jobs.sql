-- CareerFinder recruitment discoveries, independent of applications.
CREATE TABLE IF NOT EXISTS recruitment_jobs (
 id TEXT PRIMARY KEY,
 url TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 company TEXT NOT NULL,
 location TEXT NOT NULL DEFAULT '',
 work_arrangement TEXT NOT NULL DEFAULT '',
 employment_type TEXT NOT NULL DEFAULT '',
 salary TEXT NOT NULL DEFAULT '',
 match_score INTEGER,
 match_reason TEXT NOT NULL DEFAULT '',
 language_evidence TEXT NOT NULL DEFAULT '',
 eligibility_evidence TEXT NOT NULL DEFAULT '',
 verification_status TEXT NOT NULL DEFAULT 'Unverified',
 source TEXT NOT NULL DEFAULT '',
 pipeline TEXT NOT NULL DEFAULT 'Discovered',
 discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_recruitment_jobs_discovered ON recruitment_jobs(discovered_at DESC);
