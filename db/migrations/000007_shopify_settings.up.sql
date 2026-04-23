-- Shopify 連携の認証情報・接続設定を保存するテーブル
-- access_token は AES-256-GCM で暗号化（SHOPIFY_ENCRYPTION_KEY を使用）

CREATE TABLE shopify_settings (
    id                          smallint PRIMARY KEY DEFAULT 1,
    shop_domain                 text,
    api_version                 text NOT NULL DEFAULT '2025-01',
    access_token_ciphertext     text,
    access_token_iv             text,
    access_token_tag            text,
    location_id                 bigint,
    webhook_secret_ciphertext   text,
    webhook_secret_iv           text,
    webhook_secret_tag          text,
    last_connected_at           timestamptz,
    last_error                  text,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT shopify_settings_singleton CHECK (id = 1)
);

INSERT INTO shopify_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
