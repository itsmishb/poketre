DROP INDEX IF EXISTS stock_movements_refund_line_uniq;
DROP INDEX IF EXISTS stock_movements_cancel_line_uniq;

ALTER TABLE stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_ref_kind_check;

ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_ref_kind_check CHECK (
    ref_kind IS NULL OR ref_kind IN (
      'PURCHASE', 'LISTING', 'ORDER', 'RETURN', 'SHELF_AUDIT', 'MANUAL', 'OCR_REGISTER'
    )
  );
