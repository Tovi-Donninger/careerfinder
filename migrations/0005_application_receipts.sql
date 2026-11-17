-- Browser runner receipts require review; never automatically infer employer acceptance.
CREATE TABLE IF NOT EXISTS recruitment_application_receipts (
 id TEXT PRIMARY KEY,
 job_id TEXT NOT NULL REFERENCES recruitment_jobs(id),
 queue_id TEXT NOT NULL REFERENCES recruitment_application_queue(id),
 executor_status TEXT NOT NULL CHECK(executor_status IN ('Prepared','Needs review','Submitted')),
 confirmation_text TEXT NOT NULL DEFAULT '',
 confirmation_url TEXT NOT NULL DEFAULT '',
 employer_job_url TEXT NOT NULL,
 received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 review_status TEXT NOT NULL DEFAULT 'Pending review' CHECK(review_status IN ('Pending review','Rejected','Verified')),
 UNIQUE(job_id,id)
);
CREATE INDEX IF NOT EXISTS idx_application_receipts_queue ON recruitment_application_receipts(queue_id,received_at);
