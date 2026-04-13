BEGIN;

DROP INDEX IF EXISTS idx_ocr_staging_duplicate_review;
DROP INDEX IF EXISTS idx_ocr_staging_batch_created;

ALTER TABLE ocr_staging
  DROP CONSTRAINT IF EXISTS ocr_staging_merge_decision_check;
ALTER TABLE ocr_staging
  DROP CONSTRAINT IF EXISTS ocr_staging_source_check;
ALTER TABLE ocr_staging
  DROP CONSTRAINT IF EXISTS ocr_staging_duplicate_status_check;

ALTER TABLE ocr_staging
  DROP COLUMN IF EXISTS merge_decision,
  DROP COLUMN IF EXISTS duplicate_card_id,
  DROP COLUMN IF EXISTS duplicate_status,
  DROP COLUMN IF EXISTS input_location_code,
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS batch_id;

COMMIT;
