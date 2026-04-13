BEGIN;

ALTER TABLE ocr_staging
  ADD COLUMN IF NOT EXISTS batch_id text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'PIPELINE',
  ADD COLUMN IF NOT EXISTS input_location_code text,
  ADD COLUMN IF NOT EXISTS duplicate_status text NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS duplicate_card_id text REFERENCES cards(card_id),
  ADD COLUMN IF NOT EXISTS merge_decision text;

ALTER TABLE ocr_staging
  DROP CONSTRAINT IF EXISTS ocr_staging_duplicate_status_check;
ALTER TABLE ocr_staging
  ADD CONSTRAINT ocr_staging_duplicate_status_check
  CHECK (duplicate_status IN ('NONE', 'CANDIDATE', 'RESOLVED'));

ALTER TABLE ocr_staging
  DROP CONSTRAINT IF EXISTS ocr_staging_source_check;
ALTER TABLE ocr_staging
  ADD CONSTRAINT ocr_staging_source_check
  CHECK (source IN ('PIPELINE', 'WEB_UPLOAD'));

ALTER TABLE ocr_staging
  DROP CONSTRAINT IF EXISTS ocr_staging_merge_decision_check;
ALTER TABLE ocr_staging
  ADD CONSTRAINT ocr_staging_merge_decision_check
  CHECK (merge_decision IS NULL OR merge_decision IN ('MERGE_EXISTING', 'CREATE_NEW'));

CREATE INDEX IF NOT EXISTS idx_ocr_staging_batch_created
  ON ocr_staging (batch_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ocr_staging_duplicate_review
  ON ocr_staging (duplicate_status, review_status);

COMMIT;
