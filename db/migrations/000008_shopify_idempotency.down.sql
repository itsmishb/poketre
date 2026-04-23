DROP INDEX IF EXISTS stock_movements_order_line_uniq;
DROP INDEX IF EXISTS order_lines_order_shopify_line_uniq;
ALTER TABLE order_lines DROP COLUMN IF EXISTS shopify_line_item_id;
