# 確定方針（移行・基幹 DB・OCR）

更新日: 2026-04-06

本文書は、システムリプレイスで **先に決めた前提**を記録する。**技術スタック・全選択肢の確定案**は [recommended-architecture.md](./recommended-architecture.md) を正とする。画面・業務の詳細は `app/docs/システム仕様書.md` と整合させる。

---

## 1. 在庫モデル（確定: A-1）

- **正本**は **InventoryUnits（1 枚単位）** と **InventoryLots（ロット）**。
- 入出庫・予約・調整は **StockMovements** に **差分**で記録する。
- `stock_movements` には **`target_type`（UNIT / LOT）** と **`target_id`** を必ず持たせ、集計で在庫数を算出する。
- カード種別マスタは **cards（旧 CardCatalog）** を正とする。

### 1.1 引当（RESERVE）

- **`movement_type = RESERVE` かつ `qty_delta = 0`**。
- 掲載開始時 **`listings.reserved_qty = list_qty`**。Unit/Lot の **`status`** と組み合わせる。成約時は **`OUT`** で減算。

詳細は [data-model-detail.md](./data-model-detail.md) §5.2、[recommended-architecture.md](./recommended-architecture.md) §4.1。

---

## 2. 保管場所（確定: storage_locations に統合）

- Excel の **Boxes** は独立テーブル名として固定せず、**`storage_locations` に統合**する。
- **階層**（warehouse / zone / shelf 等）に加え、**`location_type`**（例: BOX, SHELF 等）で「箱」を表現する。
- 旧 `box_id` の情報（tier, pos, capacity 等）は **カラムまたはメタデータ**で保持し、移行時に 1 行＝1 ロケーションにマッピングする。
- **inventory_units / inventory_lots** は **`storage_location_id`（FK）** で保管場所を指す。

### CardLocations シートについて

- 正規化後は **Unit/Lot の `storage_location_id`** で「どこに置いてあるか」を表現できる。
- 移行直後のみ **`card_id` + `storage_location_id`** の補助ビュー／一時テーブルを許容してよい。

---

## 3. Shopify（確定方針と計画への含め方）

### 初期（Phase A）

- **1 `card_id` = 1 Shopify Product / 1 Variant（集約 SKU）** で開始する。
- **自社 DB が正**、Shopify は販売チャネル。商品・在庫 ID の対応は **`shopify_products`**（または同等テーブル）に保持する。

### 将来（Phase B・計画に含める）

- 高額・鑑定品など **現物単位 SKU** が必要になった場合、`shopify_products` に **`target_type` / `target_id`（nullable）** を追加し、同一 `card_id` に複数 variant を許容する拡張とする。

### 付随テーブル（ロードマップで実装順を管理）

- 同期キュー、Webhook 冪等、注文正規化、引当などは **`roadmap.md`** に列挙する。
- **列レベル・API 挙動**は [shopify-integration.md](./shopify-integration.md)。

---

## 4. OCR とデータ書き先（確定）

- **スプレッドシート（OCR_Staging シート）への追記は廃止**し、**RDB の `ocr_staging` テーブルへ直接書き込む**（いきなり DB のみ）。
- **OCR エンジン**は **Google Cloud Vision** と **LLM（現行: Gemini）** の **切替または併用**を前提とする。
- **ポケカ特化**（ルール補正・スキーマ・プロンプト）は可能な範囲で最優先する。

詳細は [ocr-pipeline.md](./ocr-pipeline.md)。

---

## 5. AppSheet 廃止の推奨順

| 順序 | 領域 |
|------|------|
| 1 | 認証・マスタ参照（Sets / Cards / Enums） |
| 2 | OCR 登録待ち（ocr_staging） |
| 3 | 正式登録・Unit/Lot 作成・入庫（F4 相当） |
| 4 | 在庫・棚（storage_locations・移動・一覧） |
| 5 | 掲載（listings）・手動成約 |
| 6 | Shopify 設定・同期ジョブ・注文取込 |
| 7 | 価格スナップショット・ダッシュボード |

---

## 6. 単一情報源

- 本リポジトリでは **`docs/`（本方針・移行）** と **`app/docs/`（製品仕様書）** を併用する。
- 矛盾がある場合は **製品仕様書を優先**し、本方針を追随して更新する。
