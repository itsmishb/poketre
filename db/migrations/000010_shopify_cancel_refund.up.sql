-- Shopify orders/cancelled・refunds/create に対応:
--   - stock_movements.ref_kind に 'CANCEL', 'REFUND' を追加
--   - キャンセル/返金時の在庫戻し IN 行で二重計上を防ぐ部分 UNIQUE を追加
--   - issue #23

ALTER TABLE stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_ref_kind_check;

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_ref_kind_check CHECK (
    ref_kind IS NULL OR ref_kind IN (
      'PURCHASE', 'LISTING', 'ORDER', 'RETURN', 'SHELF_AUDIT', 'MANUAL', 'OCR_REGISTER',
      'CANCEL', 'REFUND'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_cancel_line_uniq
  ON stock_movements (ref_kind, ref_id, ((metadata->>'line_id')))
  WHERE ref_kind = 'CANCEL' AND metadata ? 'line_id';

CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_refund_line_uniq
  ON stock_movements (ref_kind, ref_id, ((metadata->>'line_id')), ((metadata->>'refund_id')))
  WHERE ref_kind = 'REFUND' AND metadata ? 'line_id' AND metadata ? 'refund_id';
