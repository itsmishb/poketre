-- Webhook 冪等性強化:
--   1. order_lines に shopify_line_item_id を追加し、(order_id, shopify_line_item_id) を UNIQUE に
--   2. stock_movements に (ref_kind, ref_id, metadata->>'line_id') の部分 UNIQUE を追加
--      → 同一 Shopify 注文・同一 line を複数 webhook topic から受け取っても二重計上しない

ALTER TABLE order_lines
  ADD COLUMN IF NOT EXISTS shopify_line_item_id bigint;

CREATE UNIQUE INDEX IF NOT EXISTS order_lines_order_shopify_line_uniq
  ON order_lines (order_id, shopify_line_item_id)
  WHERE shopify_line_item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_order_line_uniq
  ON stock_movements (ref_kind, ref_id, ((metadata->>'line_id')))
  WHERE ref_kind = 'ORDER' AND metadata ? 'line_id';
