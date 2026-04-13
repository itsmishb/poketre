# 論理データモデル詳細（PostgreSQL 前提）

更新日: 2026-04-06

前提: [decided-direction.md](./decided-direction.md)、**技術選択の正本は [recommended-architecture.md](./recommended-architecture.md)**。物理 DDL は **golang-migrate** で管理する。初回適用: [`db/migrations/000001_initial_schema.up.sql`](../db/migrations/000001_initial_schema.up.sql)。ここでは **列・FK・制約の論理**を固定する（DDL と差分が出た場合は **マイグレーションを正**にして本書を更新する）。

---

## 1. 命名

| 論理名 | DB テーブル名 | 備考 |
|--------|---------------|------|
| CardCatalog | `cards` | 仕様書の `card_id` / `card_catalog_id` と整合 |
| Sets | `sets` | |
| OCR_Staging | `ocr_staging` | |
| InventoryUnit | `inventory_units` | |
| InventoryLot | `inventory_lots` | |
| StockMovements | `stock_movements` | |
| StorageLocations | `storage_locations` | Boxes 吸収 |
| ChannelListings | `listings` | 仕様書 ChannelListings と同等 |
| ChannelProducts / Shopify 対応 | `shopify_products` | Shopify は本テーブルに集約 |
| PriceSnapshots | `price_snapshots` | |
| SyncJobs | `sync_jobs` + `shopify_sync_jobs` | 汎用ジョブと Shopify 専用を分離 |
| 監査 | `audit_log` | [recommended-architecture.md](./recommended-architecture.md) §2 |
| 処理済みファイル | `processed_files` | |

---

## 2. 識別子のルール

### 2.1 `cards.card_id`

- 仕様書 F4: 例 `{set_code}-{card_number}-{rarity}` を基本とする。
- **重複時**はサフィックス（`-2`, `-3` または短い UUID）を付与し、**一意性を保証**する。
- **`serial_number`**: 人間向け表示用（例 `sv8_100/106`）。OCR 由来を正としつつ、登録時に編集可能。

### 2.2 `inventory_unit_id` / `inventory_lot_id`

- **`uuid`**（`gen_random_uuid()`）に統一。移行時は Excel 由来 ID を一時的に `legacy_id` 列で保持してもよい。
- **`serial_no`（Excel Inventory）** は **`inventory_units.serial_number`**（text、NULL 可）に対応させる。

### 2.3 `stg_id`（ocr_staging）

- **`stg_{drive_file_id}`** に固定する。

---

## 3. `storage_locations`

Excel `Boxes` を統合するための最低限の列。

| 列 | 型 | 必須 | 説明 |
|----|-----|------|------|
| `storage_location_id` | uuid | ○ | PK |
| `location_type` | text | ○ | `BOX`, `SHELF`, `ZONE`, … |
| `warehouse` | text | | 仕様書どおり |
| `zone` | text | | |
| `shelf` | text | | |
| `rack` | text | | |
| `bin` | text | | |
| `slot` | text | | Excel の `slot_no` をここへマッピング可能 |
| `tier` | int | | Excel Boxes |
| `pos` | int | | Excel Boxes |
| `capacity` | int | | Excel Boxes。不明なら NULL |
| `barcode` | text | | |
| `active` | boolean | | デフォルト true |
| `parent_location_id` | uuid | | FK → `storage_locations`、階層用 |
| `created_at` / `updated_at` | timestamptz | | |

**インデックス**: `(location_type)`, `(active)`, `(warehouse, zone)`。

---

## 4. `inventory_units` / `inventory_lots`

仕様書 §3.2 に準拠。追加列は以下。

| 列 | 説明 |
|----|------|
| `storage_location_id` | FK → `storage_locations`、**NULL 可**（未割当） |
| `serial_number` | text、NULL 可。Excel `serial_no` 移行・検索用 |

**状態** `status`: `IN_STOCK` / `RESERVED` / `LISTED` / `SOLD` / `SHIPPED` / `HOLD`（仕様書どおり）。

---

## 5. `stock_movements`

### 5.1 必須列

| 列 | 説明 |
|----|------|
| `movement_id` | uuid PK |
| `target_type` | `UNIT` \| `LOT` |
| `target_id` | 対象の PK |
| `card_id` | 集計用（冗長だがクエリ最適化に有効） |
| `moved_at` | timestamptz |
| `qty_delta` | 整数。入庫 +、出庫 − |
| `movement_type` | `IN` / `OUT` / `ADJUST` / `RESERVE` / `RELEASE` / `TRANSFER` |
| `ref_kind` | `PURCHASE` / `LISTING` / `ORDER` / `RETURN` / … |
| `ref_id` | 文字列（stg_id, listing_id, order_id 等） |
| `metadata` | jsonb | NULL 可。`TRANSFER` 時に `from_storage_location_id`, `to_storage_location_id` を格納 |

### 5.2 RESERVE（採用ルール）

- **`movement_type = RESERVE` かつ `qty_delta = 0`**。
- 掲載開始時は **`listings.reserved_qty = list_qty`** で初期化。
- Unit/Lot の **`status`**（例: `RESERVED`）と組み合わせて引当を表す。実数量の減少は **`OUT`** のみ。

### 5.3 TRANSFER（棚移動）

- **1 トランザクション**で、(1) 対象 Unit/Lot の **`storage_location_id` を更新**、(2) `stock_movements` に **1 行**（`movement_type=TRANSFER`, `qty_delta=0`, **`metadata`** に移動元・先の location id）。

---

## 6. `inventory_reservations`

**採用しない**（Phase A〜B）。`listings` + `stock_movements` + `status` で足りる。将来、多チャネル仮押さえを厳密化する段階で再検討する。

---

## 7. `listings`（ChannelListings 相当）

仕様書の列に加え、最低限以下を DB 型で固定する。

| 列 | 型 | 備考 |
|----|-----|------|
| `listing_id` | uuid | PK |
| `listing_mode` | text | `API_SYNC` / `MANUAL_MANAGED` |
| `channel` | text | CHECK で列挙 |
| `target_type` | text | `UNIT` / `LOT` / NULL（card 単位のみのとき） |
| `target_id` | text | 可変 |
| `card_id` | text | FK → `cards` |
| `list_qty` | int | |
| `reserved_qty` | int | 掲載開始時 **`list_qty` と同値**で初期化 |
| `price` | numeric(12,2) | |
| `currency` | char(3) | デフォルト JPY |
| `status` | text | |
| `sync_status` | text | Shopify 行で使用 |
| `sync_error_message` | text | |
| `sync_at` | timestamptz | |
| `external_listing_id` | text | 手動チャネル用の任意 ID。Shopify の数値 ID は **`shopify_products` を正**とし二重管理を避ける |

**インデックス**: `(card_id, status)`, `(channel, sync_status)`。

---

## 8. `shopify_products`（Phase A）

| 列 | 型 | 備考 |
|----|-----|------|
| `id` | bigserial | サロゲート PK |
| `card_id` | text | FK → `cards`, UNIQUE（Phase A） |
| `shopify_product_id` | bigint | nullable まで |
| `shopify_variant_id` | bigint | UNIQUE（NULL 可まで） |
| `shopify_inventory_item_id` | bigint | |
| `shopify_location_id` | bigint | 在庫更新先 |
| `sync_status` | text | |
| `last_synced_at` | timestamptz | |
| `last_error` | text | |

**Phase B** で `target_type`, `target_id` を NULL 可で追加し、**`UNIQUE(card_id)` を緩める**（例: `(card_id, target_type, target_id)`）。

---

## 9. 整合性ルール（アプリ／制約）

- `stock_movements.card_id` は **`target` から導出可能**な場合はアプリで検証、またはトリガで保証。
- `listings` の `API_SYNC` 行は **`shopify_products` に行が存在**してから `sync_status=SYNCED` に遷移させる。

---

## 10. 仕様書との差分（意図的）

- 仕様書の **ChannelProducts** は、Shopify については **`shopify_products` に集約**する想定。他マーケットプレイスを同等に扱う場合は後から `channel_products` を一般化する。
