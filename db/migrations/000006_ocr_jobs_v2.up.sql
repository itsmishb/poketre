-- ocr_jobs にカラム追加
ALTER TABLE ocr_jobs
  ADD COLUMN IF NOT EXISTS file_name           text,
  ADD COLUMN IF NOT EXISTS input_location_code text,
  ADD COLUMN IF NOT EXISTS stg_id              text REFERENCES ocr_staging(stg_id);

-- ocr_staging: drive_file_id の NOT NULL 解除（Google Drive 依存脱却）
ALTER TABLE ocr_staging
  ALTER COLUMN drive_file_id DROP NOT NULL;

-- ocr_staging: 新カラム追加
ALTER TABLE ocr_staging
  ADD COLUMN IF NOT EXISTS tcgdex_id   text,
  ADD COLUMN IF NOT EXISTS ocr_engine  text DEFAULT 'gemini-2.5-flash',
  ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'gemini'
    CHECK (data_source IN ('gemini', 'tcgdex', 'gemini+tcgdex', 'manual'));

-- source CHECK 制約を更新（MANUAL 追加）
ALTER TABLE ocr_staging
  DROP CONSTRAINT IF EXISTS ocr_staging_source_check;
ALTER TABLE ocr_staging
  ADD CONSTRAINT ocr_staging_source_check
  CHECK (source IN ('PIPELINE', 'WEB_UPLOAD', 'MANUAL'));
