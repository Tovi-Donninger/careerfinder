CREATE TABLE IF NOT EXISTS recruitment_zero_experience_evidence (job_url TEXT PRIMARY KEY, evidence TEXT NOT NULL, source_url TEXT NOT NULL, verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
