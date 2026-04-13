BEGIN;

DROP INDEX IF EXISTS idx_ocr_staging_ocr_status;

ALTER TABLE ocr_staging
  DROP COLUMN IF EXISTS ocr_status,
  DROP COLUMN IF EXISTS ocr_job_id,
  DROP COLUMN IF EXISTS resolved_storage_location_id;

DROP INDEX IF EXISTS idx_ocr_jobs_batch_created;
DROP INDEX IF EXISTS idx_ocr_jobs_status_next;
DROP TABLE IF EXISTS ocr_jobs;

COMMIT;
