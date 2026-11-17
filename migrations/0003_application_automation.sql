-- Application automation: private queue, safety gate and audit trail.
CREATE TABLE IF NOT EXISTS recruitment_application_policy (
 id INTEGER PRIMARY KEY CHECK(id=1),
 enabled INTEGER NOT NULL DEFAULT 0,
 min_match_score INTEGER NOT NULL DEFAULT 85,
 max_daily_submissions INTEGER NOT NULL DEFAULT 5,
 require_confirmed_open INTEGER NOT NULL DEFAULT 1,
 require_confirmed_language INTEGER NOT NULL DEFAULT 1,
 require_confirmed_eligibility INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO recruitment_application_policy(id) VALUES(1);
CREATE TABLE IF NOT EXISTS recruitment_application_queue (
 id TEXT PRIMARY KEY,
 job_id TEXT NOT NULL UNIQUE REFERENCES recruitment_jobs(id),
 status TEXT NOT NULL DEFAULT 'Needs review',
 reason TEXT NOT NULL DEFAULT '',
 provider TEXT NOT NULL DEFAULT '',
 external_reference TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS recruitment_application_events (
 id TEXT PRIMARY KEY,
 queue_id TEXT NOT NULL REFERENCES recruitment_application_queue(id),
 event_type TEXT NOT NULL,
 details TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_application_queue_status ON recruitment_application_queue(status,created_at);
