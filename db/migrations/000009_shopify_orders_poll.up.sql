-- 注文ポーリング救済のため、最終取込時刻を保存
ALTER TABLE shopify_settings
  ADD COLUMN IF NOT EXISTS last_order_poll_at timestamptz;
