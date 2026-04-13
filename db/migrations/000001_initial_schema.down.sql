-- Rollback initial schema (local / dev only; production uses forward-only migrations)

BEGIN;

DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS processed_files;
DROP TABLE IF EXISTS sync_jobs;
DROP TABLE IF EXISTS price_snapshots;
DROP TABLE IF EXISTS order_lines;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS shopify_webhook_events;
DROP TABLE IF EXISTS shopify_sync_jobs;
DROP TABLE IF EXISTS listings;
DROP TABLE IF EXISTS shopify_products;
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS ocr_staging;
DROP TABLE IF EXISTS inventory_units;
DROP TABLE IF EXISTS inventory_lots;
DROP TABLE IF EXISTS cards;
DROP TABLE IF EXISTS storage_locations;
DROP TABLE IF EXISTS sets;
DROP TABLE IF EXISTS app_users;

COMMIT;
