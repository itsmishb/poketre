BEGIN;

ALTER TABLE ocr_jobs
  DROP COLUMN IF EXISTS file_name,
  DROP COLUMN IF EXISTS input_location_code,
  DROP COLUMN IF EXISTS stg_id;

ALTER TABLE ocr_staging
  ALTER COLUMN drive_file_id SET NOT NULL;

ALTER TABLE ocr_staging
  DROP COLUMN IF EXISTS tcgdex_id,
  DROP COLUMN IF EXISTS ocr_engine,
  DROP COLUMN IF EXISTS data_source;

ALTER TABLE ocr_staging
  DROP CONSTRAINT IF EXISTS ocr_staging_source_check;
ALTER TABLE ocr_staging
  ADD CONSTRAINT ocr_staging_source_check
  CHECK (source IN ('PIPELINE', 'WEB_UPLOAD'));

COMMIT;
