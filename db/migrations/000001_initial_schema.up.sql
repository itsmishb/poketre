-- Poketre initial schema (PostgreSQL 16+)
-- Logical model: docs/data-model-detail.md
-- Stack: docs/recommended-architecture.md

BEGIN;

-- ---------------------------------------------------------------------------
-- sets
-- ---------------------------------------------------------------------------
CREATE TABLE sets (
    set_code         text PRIMARY KEY,
    set_name_ja      text,
    series           text,
    release_date     date,
    total_cards      integer,
    regulation_set   text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- cards (CardCatalog)
-- ---------------------------------------------------------------------------
CREATE TABLE cards (
    card_id              text PRIMARY KEY,
    set_code             text NOT NULL REFERENCES sets (set_code),
    card_number          integer,
    number_total         integer,
    name_ja              text NOT NULL,
    card_type            text NOT NULL
        CHECK (card_type IN ('ポケモン', 'トレーナーズ', 'エネルギー', 'その他')),
    trainer_subtype      text,
    poke_type            text,
    regulation_mark      text,
    rarity               text,
    holo                 boolean,
    image_ref_standard   text,
    card_number_text     text,
    mirror_pattern       text,
    illustrator          text,
    notes                text,
    is_psa_slab          boolean NOT NULL DEFAULT false,
    psa_grade            integer,
    psa_cert_number      text,
    psa_label_text       text,
    psa_card_number      text,
    searchable_text      text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cards_set_code ON cards (set_code);
CREATE INDEX idx_cards_name_ja ON cards (name_ja);

-- ---------------------------------------------------------------------------
-- storage_locations (Boxes / 棚マスタ統合)
-- ---------------------------------------------------------------------------
CREATE TABLE storage_locations (
    storage_location_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    legacy_box_id         text UNIQUE,
    location_type         text NOT NULL
        CHECK (location_type IN ('BOX', 'SHELF', 'ZONE', 'WAREHOUSE', 'BIN', 'OTHER')),
    warehouse             text,
    zone                  text,
    shelf                 text,
    rack                  text,
    bin                   text,
    slot                  text,
    tier                  integer,
    pos                   integer,
    capacity              integer,
    barcode               text,
    active                boolean NOT NULL DEFAULT true,
    parent_location_id    uuid REFERENCES storage_locations (storage_location_id),
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_storage_locations_type_active ON storage_locations (location_type, active);
CREATE INDEX idx_storage_locations_wh_zone ON storage_locations (warehouse, zone);

-- ---------------------------------------------------------------------------
-- app_users (Auth.js / Google 連携想定)
-- ---------------------------------------------------------------------------
CREATE TABLE app_users (
    user_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email            text NOT NULL UNIQUE,
    display_name     text,
    role             text NOT NULL CHECK (role IN ('operator', 'admin')),
    google_sub       text UNIQUE,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- inventory_units / inventory_lots
-- ---------------------------------------------------------------------------
CREATE TABLE inventory_units (
    inventory_unit_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id              text NOT NULL REFERENCES cards (card_id),
    condition_grade      text,
    storage_location_id  uuid REFERENCES storage_locations (storage_location_id),
    status               text NOT NULL
        CHECK (status IN ('IN_STOCK', 'RESERVED', 'LISTED', 'SOLD', 'SHIPPED', 'HOLD')),
    front_image_url      text,
    back_image_url       text,
    serial_number        text,
    acquisition_cost     numeric(12, 2),
    acquisition_date     date,
    memo                 text,
    legacy_id            text UNIQUE,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_units_card ON inventory_units (card_id);
CREATE INDEX idx_inventory_units_location ON inventory_units (storage_location_id);
CREATE INDEX idx_inventory_units_serial ON inventory_units (serial_number) WHERE serial_number IS NOT NULL;

CREATE TABLE inventory_lots (
    inventory_lot_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id              text NOT NULL REFERENCES cards (card_id),
    condition_grade      text,
    qty_on_hand          integer NOT NULL CHECK (qty_on_hand >= 0),
    storage_location_id  uuid REFERENCES storage_locations (storage_location_id),
    status               text NOT NULL
        CHECK (status IN ('IN_STOCK', 'RESERVED', 'LISTED', 'SOLD', 'SHIPPED', 'HOLD')),
    lot_type             text,
    avg_cost             numeric(12, 2),
    legacy_id            text UNIQUE,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_lots_card ON inventory_lots (card_id);

-- ---------------------------------------------------------------------------
-- stock_movements
-- ---------------------------------------------------------------------------
CREATE TABLE stock_movements (
    movement_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type     text NOT NULL CHECK (target_type IN ('UNIT', 'LOT')),
    target_id       uuid NOT NULL,
    card_id         text NOT NULL REFERENCES cards (card_id),
    moved_at        timestamptz NOT NULL DEFAULT now(),
    qty_delta       integer NOT NULL,
    movement_type   text NOT NULL
        CHECK (movement_type IN ('IN', 'OUT', 'ADJUST', 'RESERVE', 'RELEASE', 'TRANSFER')),
    ref_kind        text,
    ref_id          text,
    operator_id     uuid REFERENCES app_users (user_id) ON DELETE SET NULL,
    notes           text,
    metadata        jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT stock_movements_ref_kind_check CHECK (
        ref_kind IS NULL OR ref_kind IN (
            'PURCHASE', 'LISTING', 'ORDER', 'RETURN', 'SHELF_AUDIT', 'MANUAL', 'OCR_REGISTER'
        )
    )
);

CREATE INDEX idx_stock_movements_card ON stock_movements (card_id);
CREATE INDEX idx_stock_movements_target ON stock_movements (target_type, target_id);
CREATE INDEX idx_stock_movements_moved_at ON stock_movements (moved_at);

-- ---------------------------------------------------------------------------
-- ocr_staging
-- ---------------------------------------------------------------------------
CREATE TABLE ocr_staging (
    stg_id                    text PRIMARY KEY,
    drive_file_id             text NOT NULL UNIQUE,
    file_name                 text,
    image_url                 text,
    raw_text                  text,
    ai_json                   jsonb,
    status                    text NOT NULL DEFAULT '登録待ち',
    review_status             text NOT NULL DEFAULT 'PENDING'
        CHECK (review_status IN ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_RESCAN')),
    reviewer_id               text,
    approved_at               timestamptz,
    initial_qty               integer NOT NULL DEFAULT 1,
    initial_condition         text,
    storage_location_id       uuid REFERENCES storage_locations (storage_location_id),
    approved_inventory_type   text CHECK (approved_inventory_type IS NULL OR approved_inventory_type IN ('UNIT', 'LOT')),
    intended_channels         text,
    confirmed_at              timestamptz,
    serial_number             text,
    set_code                  text,
    regulation_mark           text,
    card_number               integer,
    number_total              integer,
    rarity                    text,
    card_type                 text,
    trainer_subtype           text,
    poke_type                 text,
    name_ja                   text,
    holo                      boolean,
    illustrator               text,
    card_number_text          text,
    mirror_pattern            text,
    qty                       integer NOT NULL DEFAULT 1,
    target_box_id             text,
    target_slot_no            text,
    confidence                numeric(7, 4),
    notes                     text,
    is_psa_slab               boolean,
    psa_grade                 integer,
    psa_cert_number           text,
    psa_label_text            text,
    psa_card_number           text,
    last_error                text,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ocr_staging_status ON ocr_staging (status, created_at);
CREATE INDEX idx_ocr_staging_review ON ocr_staging (review_status, status);

-- ---------------------------------------------------------------------------
-- listings
-- ---------------------------------------------------------------------------
CREATE TABLE listings (
    listing_id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_mode            text NOT NULL CHECK (listing_mode IN ('API_SYNC', 'MANUAL_MANAGED')),
    channel                 text NOT NULL
        CHECK (channel IN ('SHOPIFY', 'YAHOO_AUCTION', 'MERCARI', 'OTHER')),
    target_type             text CHECK (target_type IS NULL OR target_type IN ('UNIT', 'LOT')),
    target_id               uuid,
    card_id                 text NOT NULL REFERENCES cards (card_id),
    list_qty                integer NOT NULL CHECK (list_qty > 0),
    reserved_qty            integer NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0),
    price                   numeric(12, 2),
    currency                char(3) NOT NULL DEFAULT 'JPY',
    listing_title           text,
    listing_description     text,
    listing_image_urls      text,
    status                  text NOT NULL
        CHECK (status IN ('DRAFT', 'LISTED', 'RESERVED', 'SOLD', 'ENDED', 'SYNC_ERROR')),
    published_at            timestamptz,
    ended_at                timestamptz,
    sold_at                 timestamptz,
    sold_price              numeric(12, 2),
    sync_status             text,
    sync_error_message      text,
    sync_at                 timestamptz,
    external_listing_id     text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_listings_card_status ON listings (card_id, status);
CREATE INDEX idx_listings_channel_sync ON listings (channel, sync_status);

-- ---------------------------------------------------------------------------
-- shopify_products (Phase A: 1 card_id per row)
-- ---------------------------------------------------------------------------
CREATE TABLE shopify_products (
    id                         bigserial PRIMARY KEY,
    card_id                    text NOT NULL UNIQUE REFERENCES cards (card_id),
    shopify_product_id         bigint,
    shopify_variant_id         bigint,
    shopify_inventory_item_id  bigint,
    shopify_location_id        bigint,
    sync_status                text NOT NULL DEFAULT 'PENDING',
    last_synced_at             timestamptz,
    last_error                 text,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX shopify_products_variant_id_key
    ON shopify_products (shopify_variant_id)
    WHERE shopify_variant_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- shopify_sync_jobs
-- ---------------------------------------------------------------------------
CREATE TABLE shopify_sync_jobs (
    job_id       bigserial PRIMARY KEY,
    job_type     text NOT NULL,
    card_id      text REFERENCES cards (card_id),
    payload      jsonb,
    status       text NOT NULL DEFAULT 'QUEUED'
        CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RETRY')),
    attempt      integer NOT NULL DEFAULT 0,
    next_run_at  timestamptz NOT NULL DEFAULT now(),
    last_error   text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_shopify_sync_jobs_status_next ON shopify_sync_jobs (status, next_run_at);

-- ---------------------------------------------------------------------------
-- shopify_webhook_events
-- ---------------------------------------------------------------------------
CREATE TABLE shopify_webhook_events (
    event_id        text PRIMARY KEY,
    topic           text NOT NULL,
    shop_domain     text,
    received_at     timestamptz NOT NULL DEFAULT now(),
    payload         jsonb NOT NULL,
    processed_at    timestamptz,
    process_status  text NOT NULL DEFAULT 'RECEIVED'
        CHECK (process_status IN ('RECEIVED', 'PROCESSED', 'FAILED')),
    last_error      text
);

CREATE INDEX idx_shopify_webhook_events_status ON shopify_webhook_events (process_status, received_at);

-- ---------------------------------------------------------------------------
-- orders / order_lines
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
    order_id           bigserial PRIMARY KEY,
    channel            text NOT NULL,
    external_order_id  text NOT NULL,
    order_status       text,
    currency           char(3) NOT NULL DEFAULT 'JPY',
    total_price        numeric(14, 2),
    ordered_at         timestamptz,
    raw                jsonb,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (channel, external_order_id)
);

CREATE TABLE order_lines (
    line_id             bigserial PRIMARY KEY,
    order_id            bigint NOT NULL REFERENCES orders (order_id) ON DELETE CASCADE,
    card_id             text REFERENCES cards (card_id),
    qty                 integer NOT NULL,
    unit_price          numeric(12, 2),
    shopify_variant_id  bigint,
    raw                 jsonb
);

CREATE INDEX idx_order_lines_order ON order_lines (order_id);

-- ---------------------------------------------------------------------------
-- price_snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE price_snapshots (
    price_snapshot_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id              text NOT NULL REFERENCES cards (card_id),
    source_name          text,
    source_type          text,
    condition_assumption text,
    price_type           text,
    price_value          numeric(12, 2) NOT NULL,
    currency             char(3) NOT NULL DEFAULT 'JPY',
    fetched_at           timestamptz NOT NULL,
    source_url           text,
    raw_payload          text,
    created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_price_snapshots_card_fetched ON price_snapshots (card_id, fetched_at DESC);

-- ---------------------------------------------------------------------------
-- sync_jobs (汎用)
-- ---------------------------------------------------------------------------
CREATE TABLE sync_jobs (
    sync_job_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type        text NOT NULL,
    status          text NOT NULL CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED')),
    started_at      timestamptz NOT NULL DEFAULT now(),
    finished_at     timestamptz,
    processed_count integer,
    error_message   text,
    payload         jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- processed_files (Drive 冪等)
-- ---------------------------------------------------------------------------
CREATE TABLE processed_files (
    drive_file_id   text PRIMARY KEY,
    processed_at    timestamptz NOT NULL,
    ocr_engine      text,
    status          text NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
    error_message   text
);

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
    id          bigserial PRIMARY KEY,
    actor_id    uuid REFERENCES app_users (user_id) ON DELETE SET NULL,
    action      text NOT NULL,
    entity      text NOT NULL,
    entity_id   text NOT NULL,
    payload     jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_entity ON audit_log (entity, entity_id);
CREATE INDEX idx_audit_log_occurred ON audit_log (occurred_at DESC);

COMMIT;
