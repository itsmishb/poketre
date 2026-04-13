-- ローカル開発用（本番では実行しない）
-- psql "$DATABASE_URL" -f db/seeds/dev_seed.sql

INSERT INTO sets (set_code, set_name_ja, series, total_cards, regulation_set)
VALUES ('sv8', 'クレイバースト', 'SV', 106, 'G')
ON CONFLICT (set_code) DO NOTHING;

-- 固定 UUID で冪等に 1 棚だけ作成
INSERT INTO storage_locations (
    storage_location_id, location_type, warehouse, zone, shelf, tier, pos, active
)
VALUES (
    '00000000-0000-4000-8000-000000000001'::uuid,
    'BOX',
    'default',
    'A',
    '01',
    1,
    1,
    true
)
ON CONFLICT (storage_location_id) DO NOTHING;

-- サンプル ocr_staging（一覧確認用）
INSERT INTO ocr_staging (
    stg_id,
    drive_file_id,
    file_name,
    image_url,
    status,
    serial_number,
    name_ja,
    set_code,
    rarity,
    qty,
    card_type
)
VALUES (
    'stg_sample_dev_001',
    'sample_drive_file_dev_001',
    'sample-card.jpg',
    'https://placehold.co/400x560/png?text=Sample',
    '登録待ち',
    'sv8_001/106',
    'サンプルカード（開発）',
    'sv8',
    'RR',
    1,
    'ポケモン'
)
ON CONFLICT (stg_id) DO NOTHING;
