BEGIN;

ALTER TABLE cards DROP COLUMN IF EXISTS public_description_ja;

COMMIT;
