BEGIN;

DROP TRIGGER IF EXISTS tr_orders_updated_at ON orders;
DROP TRIGGER IF EXISTS tr_shopify_sync_jobs_updated_at ON shopify_sync_jobs;
DROP TRIGGER IF EXISTS tr_shopify_products_updated_at ON shopify_products;
DROP TRIGGER IF EXISTS tr_ocr_staging_updated_at ON ocr_staging;
DROP TRIGGER IF EXISTS tr_listings_updated_at ON listings;
DROP TRIGGER IF EXISTS tr_inventory_lots_updated_at ON inventory_lots;
DROP TRIGGER IF EXISTS tr_inventory_units_updated_at ON inventory_units;
DROP TRIGGER IF EXISTS tr_app_users_updated_at ON app_users;
DROP TRIGGER IF EXISTS tr_storage_locations_updated_at ON storage_locations;
DROP TRIGGER IF EXISTS tr_cards_updated_at ON cards;
DROP TRIGGER IF EXISTS tr_sets_updated_at ON sets;

DROP FUNCTION IF EXISTS poketre_set_updated_at();

COMMIT;
