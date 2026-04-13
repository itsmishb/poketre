BEGIN;

CREATE TABLE IF NOT EXISTS ocr_jobs (
  job_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id          text NOT NULL,
  source            text NOT NULL DEFAULT 'WEB_UPLOAD',
  gcs_bucket        text NOT NULL,
  gcs_object_path   text NOT NULL,
  status            text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RETRY')),
  attempt_count     integer NOT NULL DEFAULT 0,
  next_run_at       timestamptz NOT NULL DEFAULT now(),
  last_error        text,
  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status_next ON ocr_jobs (status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_ocr_jobs_batch_created ON ocr_jobs (batch_id, created_at);

ALTER TABLE ocr_staging
  ADD COLUMN IF NOT EXISTS resolved_storage_location_id uuid REFERENCES storage_locations(storage_location_id),
  ADD COLUMN IF NOT EXISTS ocr_job_id uuid REFERENCES ocr_jobs(job_id),
  ADD COLUMN IF NOT EXISTS ocr_status text NOT NULL DEFAULT 'PENDING'
    CHECK (ocr_status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED'));

UPDATE ocr_staging SET source = COALESCE(source, 'PIPELINE');
UPDATE ocr_staging SET duplicate_status = COALESCE(duplicate_status, 'NONE');

CREATE INDEX IF NOT EXISTS idx_ocr_staging_ocr_status ON ocr_staging (ocr_status, created_at);

COMMIT;
