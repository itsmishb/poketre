# Shopify 連携詳細（Phase A / B）

更新日: 2026-04-06

前提: [decided-direction.md](./decided-direction.md) §3、[data-model-detail.md](./data-model-detail.md) §8。

---

## 1. 責務分離

| データ | 正本 | Shopify 側 |
|--------|------|------------|
| カード定義・在庫の意味 | `cards`, `inventory_units`/`lots`, `stock_movements` | Product/Variant/Inventory の反映先 |
| 販売チャネル上の「掲載」 | `listings` | 商品の掲載状態・価格に同期 |
| Shopify の ID | `shopify_products` | Admin API が返す ID を保存 |

**ルール**: `listings` に `shopify_variant_id` を重ねて持たない設計も可能だが、**ID の単一の正は `shopify_products`** とし、`listings` はビジネス状態（`status`, `list_qty`, `price`）に集中させると同期が破綻しにくい。

---

## 2. Phase A（1 card_id = 1 variant）

### 2.1 同期フロー（概要）

1. `cards` にマスタが存在する。
2. 「Shopify に出す」操作で `listings` 行（`listing_mode=API_SYNC`, `channel=SHOPIFY`）が作成される。
3. **`shopify_sync_jobs`** に `UPSERT_PRODUCT` 等のジョブが投入される。
4. ワーカーが Admin API を実行:
   - Product/Variant の create または update
   - **InventoryLevel**（`inventory_item_id` + `location_id` + `available`）を更新
5. 成功時に `shopify_products` に **product_id, variant_id, inventory_item_id** を保存し、`sync_status` を更新。

### 2.2 必須 ID（在庫 API）

- **`inventory_item_id`**: Variant 作成後に取得可能。
- **`location_id`**: ストアのロケーション（通常 1 つ以上）。**自社が在庫を減らすロケーション**を `shopify_products.shopify_location_id` に保存する。

取得方法は Admin API（`locations` 一覧）またはストア設定で決め打ち＋環境変数でもよい。

### 2.3 在庫数のソース（採用）

[recommended-architecture.md](./recommended-architecture.md) §5 に従う。

- Shopify に送る **`available`** は **`max(0, 在庫可能数（仕様書 F9）)`** を正とする。
- **`listings.list_qty`** は掲載レコード上の希望・表示用。**available は在庫可能数を超えない**（clamp）。二重販売を防ぐ。

---

## 3. Shopify Phase B（個体 SKU）

- `shopify_products` に `target_type`（`UNIT`/`LOT`）, `target_id` を追加。
- **`UNIQUE(card_id)` を解除**し、同一 `card_id` に複数 variant を許容。
- 同期ジョブの `payload` に `target_type`/`target_id` を含める。

---

## 4. 注文・Webhook

### 4.1 冪等

- HTTP ヘッダ **`X-Shopify-Event-Id`** の値を **`shopify_webhook_events.event_id`** に保存し、**同一 ID は処理スキップ**。
- ヘッダが無い環境では **`topic` + `order_id` + `updated_at` のハッシュ**をフォールバックとする（衝突時はログ監視）。

### 4.2 処理順序

1. `shopify_webhook_events` に **RECEIVED** で INSERT（重複なら終了）。
2. `orders` / `order_lines` を UPSERT。
3. Line Item の **variant_id** → `shopify_products` → `card_id` / `target` を解決。
4. **`stock_movements`** に `OUT`（`ref_kind=ORDER`, `ref_id=order_id`）。
5. 対象 Unit/Lot の `status` を更新。
6. Webhook 行を **PROCESSED**。

### 4.3 ポーリング併用

- Webhook 失敗時の救済として **Orders API のポーリング**を `shopify_sync_jobs` の `IMPORT_ORDERS` で実行可能にする。

---

## 5. エラー・リトライ

| 状況 | 挙動 |
|------|------|
| 429 / rate limit | `next_run_at` を指数バックオフで再キュー |
| 5xx | 同上 |
| 4xx（不正リクエスト） | `FAILED`、人手で `listings.sync_error_message` を確認 |
| 部分成功 | トランザクションで **Product 作成成功・在庫失敗**を分離し、再実行時は **冪等更新**（variant ID 既存）を前提にする |

---

## 6. 秘密情報

- **Shopify Admin API access token**（`shpat_...`）は Secret Manager。
- **Webhook 検証**: HMAC（`X-Shopify-Hmac-Sha256`）を検証してから受信処理する。

---

## 7. 仕様書との対応

| 仕様書 | 本ドキュメント |
|--------|----------------|
| F14 Shopify 商品・在庫同期 | §2 |
| F15 注文取り込み | §4 |
| ChannelListings / ChannelProducts | `listings` + `shopify_products` |
