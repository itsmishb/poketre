-- Auto-update updated_at on row change

BEGIN;

CREATE OR REPLACE FUNCTION poketre_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_sets_updated_at
  BEFORE UPDATE ON sets FOR EACH ROW EXECUTE PROCEDURE poketre_set_updated_at();

CREATE TRIGGER tr_cards_updated_at
  BEFORE UPDATE ON cards FOR EACH ROW EXECUTE PROCEDURE poketre_set_updated_at();

CREATE TRIGGER tr_storage_locations_updated_at
  BEFORE UPDATE ON storage_locations FOR EACH ROW EXECUTE PROCEDURE poketre_set_updated_at();

CREATE TRIGGER tr_app_users_updated_at
  BEFORE UPDATE ON app_users FOR EACH ROW EXECUTE PROCEDURE poketre_set_updated_at();

CREATE TRIGGER tr_inventory_units_updated_at
  BEFORE UPDATE ON inventory_units FOR EACH ROW EXECUTE PROCEDURE poketre_set_updated_at();

CREATE TRIGGER tr_inventory_lots_updated_at
  BEFORE UPDATE ON inventory_lots FOR EACH ROW EXECUTE PROCEDURE poketre_set_updated_at();

CREATE TRIGGER tr_listings_updated_at
  BEFORE UPDATE ON listings FOR EACH ROW EXECUTE PROCEDURE poketre_set_updated_at();

CREATE TRIGGER tr_ocr_staging_updated_at
  BEFORE UPDATE ON ocr_staging FOR EACH ROW EXECUTE PROCEDURE poketre_set_updated_at();

CREATE TRIGGER tr_shopify_products_updated_at
  BEFORE UPDATE ON shopify_products FOR EACH ROW EXECUTE PROCEDURE poketre_set_updated_at();

CREATE TRIGGER tr_shopify_sync_jobs_updated_at
  BEFORE UPDATE ON shopify_sync_jobs FOR EACH ROW EXECUTE PROCEDURE poketre_set_updated_at();

CREATE TRIGGER tr_orders_updated_at
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE PROCEDURE poketre_set_updated_at();

COMMIT;
