# Excel（システムdb.xlsx）→ PostgreSQL 対応表（詳細）

更新日: 2026-04-06

移行元: `ref/システムdb.xlsx`。論理モデルは [data-model-detail.md](./data-model-detail.md)。

---

## 1. シート一覧と移行先

| Excel シート | 主な移行先テーブル | 備考 |
|--------------|-------------------|------|
| Sets | `sets` | |
| Cards | `cards` | |
| OCR_Staging | `ocr_staging` | 列拡張あり（仕様書の確認用列） |
| Listings | `listings` | 列は仕様書 ChannelListings に合わせて拡張 |
| Boxes | `storage_locations` | `location_type='BOX'` 等 |
| CardLocations | 下記 §7 で変換 | 直接テーブル化しない |
| Inventory | `stock_movements` | `serial_no` → Unit 解決が必要 |
| Enums | **列挙値は `text` + CHECK**（PostgreSQL ENUM 型は使わない） | [recommended-architecture.md](./recommended-architecture.md) §4.3 |
| _Internal_Processed_Files | `processed_files` | **ヘッダ修正の可能性** — [open-questions-and-gaps.md](./open-questions-and-gaps.md) |

---

## 2. Sets（6 列）

| Excel 列 | DB 列 | 備考 |
|----------|-------|------|
| set_code | `set_code` | UNIQUE |
| set_name_ja | `set_name_ja` | |
| series | `series` | |
| release_date | `release_date` | date |
| total_cards | `total_cards` | int |
| regulation_set | `regulation_set` | |

`set_id` は `set_code` と同一 text でも、UUID でも可（[data-model-detail.md](./data-model-detail.md)）。

---

## 3. Cards（21 列）

| Excel 列 | DB 列 | 備考 |
|----------|-------|------|
| card_id | `card_id` | PK |
| set_code | `set_code` | FK → sets |
| card_number | `card_number` | |
| number_total | `number_total` | |
| name_ja | `name_ja` | |
| card_type | `card_type` | |
| trainer_subtype | `trainer_subtype` | |
| poke_type | `poke_type` | |
| regulation_mark | `regulation_mark` | |
| rarity | `rarity` | |
| holo | `holo` | bool または text |
| image_front | `image_ref_standard` または `image_front` | カラム名は DDL で統一 |
| card_number_text | `card_number_text` | |
| mirror_pattern | `mirror_pattern` / `art_variant` | 仕様書の `art_variant` と統合可 |
| illustrator | `illustrator` | |
| notes | `notes` | |
| is_psa_slab … psa_card_number | PSA 系 | boolean / int / text |

生成列: `searchable_text`（`name_ja`, `set_code`, `card_number_text` 等の連結）。

---

## 4. OCR_Staging（31 列）

Excel 列（抽出時点）:

`stg_id`, `file_name`, `image_url`, `raw_text`, `ai_json`, `status`, `confirmed_at`, `serial_number`, `set_code`, `regulation_mark`, `card_number`, `number_total`, `rarity`, `card_type`, `trainer_subtype`, `poke_type`, `name_ja`, `holo`, `illustrator`, `card_number_text`, `mirror_pattern`, `qty`, `target_box_id`, `target_slot_no`, `confidence`, `notes`, `is_psa_slab`, `psa_grade`, `psa_cert_number`, `psa_label_text`, `psa_card_number`

**仕様書で追加する列**（DB）:

| 列 | 用途 |
|----|------|
| `review_status` | PENDING / APPROVED / REJECTED / NEEDS_RESCAN |
| `reviewer_id` | 任意 |
| `approved_at` | timestamptz |
| `initial_qty` | int |
| `initial_condition` | text（condition_grade） |
| `storage_location_id` | FK → `storage_locations`（F4 入力） |
| `approved_inventory_type` | UNIT / LOT |
| `intended_channels` | text（任意） |
| `drive_file_id` | **NOT NULL**。Google Drive file ID |

`target_box_id` / `target_slot_no` は **`storage_location_id` に解決**するか、F4 までに **box+slot → location_id** へ変換。

---

## 5. Listings（14 列）

| Excel 列 | DB 列 | 備考 |
|----------|-------|------|
| list_id | `listing_id` | PK |
| card_id | `card_id` | FK |
| channel | `channel` | |
| status | `status` | 仕様書の列挙に合わせる |
| list_qty | `list_qty` | |
| price | `price` | numeric |
| currency | `currency` | |
| title | `listing_title` | |
| description | `listing_description` | |
| start_at | `published_at` | 名前は仕様書に合わせても可 |
| end_at | `ended_at` | |
| order_id | **外部参照** | `orders` 導入後は `order_id` FK に寄せる |
| sold_price | `sold_price` | |
| sold_at | `sold_at` | |

**追加必須**（仕様書 ChannelListings）: `listing_mode`, `target_type`, `target_id`, `reserved_qty`, `listing_image_urls`, `sync_status`, `sync_error_message`, `sync_at` 等。

---

## 6. Inventory（差分台帳）

| Excel 列 | DB 列 | 備考 |
|----------|-------|------|
| movement_id | `movement_id` | PK |
| serial_no | **解決** | → `inventory_units.serial_number` または `inventory_unit_id` にマッピング |
| moved_at | `moved_at` | timestamptz |
| qty_delta | `qty_delta` | |
| movement_type | `movement_type` | |
| box_id | **解決** | `storage_locations` で `box_id` に相当する行の `storage_location_id` |
| slot_no | **解決** | 同一 location に slot 列があるか、子 location の `slot` にする |
| ref_kind | `ref_kind` | |
| ref_id | `ref_id` | |
| operator | `operator` | |
| notes | `notes` | |
| — | `target_type` | `UNIT` または `LOT` |
| — | `target_id` | 解決後の ID |
| — | `card_id` | 冗長コピー |

**移行手順（推奨）**:

1. `sets` → `cards` → `storage_locations` を投入
2. **Excel Inventory より前に**、`serial_no` と `card_id` から **`inventory_units` を生成**（または既存台帳から取り込む）
3. `stock_movements` に変換し、`target_id` を紐づける

---

## 7. CardLocations（4 列）の移行アルゴリズム

Excel: `loc_id`, `card_id`, `box_id`, `slot_no`

**意味**: 「カード種別 `card_id` が `box_id` の `slot_no` にある」という **配置情報**。

**パターン A（推奨）**: 既に `inventory_units` が存在する場合、

- `storage_location_id` = `resolve(box_id, slot_no)`（`storage_locations` の 1 行に特定）
- 該当 `card_id` の Unit 行の `storage_location_id` を更新

**パターン B**: Unit がまだ無い場合、

- **仮の Unit** を `card_id` + `storage_location_id` で生成し、後からシリアル採番してもよい

**パターン C**: `CardLocations` が **「種別ごとの定位置」** だけの場合、

- **マスタビュー** `v_card_default_location(card_id, storage_location_id)` として保持し、物理在庫は Unit/Lot にのみ持つ

移行時は **Excel の行数と Inventory の serial_no の整合**をスクリプトで検証する。

---

## 8. Boxes（4 列）

| Excel 列 | DB 列 |
|----------|-------|
| box_id | 移行用 **`legacy_box_id` text**（一時）。PK は **`storage_location_id` uuid**（新規生成） |
| tier | `tier` |
| pos | `pos` |
| capacity | `capacity` |

`location_type = 'BOX'` を付与。移行完了後 `legacy_box_id` は削除可。

---

## 9. Enums（11 列）

列名: `regulation`, `poke_type`, `rarity`, …

**移行案（採用）**:

- DB では **各カラムを `text` + CHECK** で表現（[recommended-architecture.md](./recommended-architecture.md) §4.3）。
- マスタテーブル `enum_values` は **作らない**（運用が複雑になるため）。アプリは **TypeScript const / zod** と二重管理。

---

## 10. 外部キー投入順（再掲）

1. `sets`
2. `cards`
3. `storage_locations`
4. `inventory_units` / `inventory_lots`（`CardLocations` / Inventory から導出）
5. `stock_movements`
6. `ocr_staging`（必要なら）
7. `listings`
8. Shopify 系・`orders`（後続フェーズ）

---

## 11. Shopify・注文（Excel に無い）

- `shopify_products`, `shopify_sync_jobs`, `shopify_webhook_events`, `orders`, `order_lines` は **新規作成**。[shopify-integration.md](./shopify-integration.md) を参照。
