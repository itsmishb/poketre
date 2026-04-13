# ロードマップ（DB 移行・OCR・AppSheet・Shopify）

更新日: 2026-04-06

前提: [decided-direction.md](./decided-direction.md)。各フェーズの **完了条件（受け入れ基準）** を併記する。

---

## フェーズ 0: 基盤

**内容**

- Cloud SQL（PostgreSQL）プロビジョニング
- マイグレーション（DDL）とローカル／ステージング検証
- Secret Manager（DB、Shopify、Vision、Gemini 等）
- 管理 API（Cloud Run または別サービス）のスケルトン

**受け入れ基準**

- ステージングに **マイグレーション適用**が再現可能（CI または Makefile）。
- アプリ／バッチから **IAM またはパスワード＋SSL** で接続できる。

---

## フェーズ 1: データ移行とマスタ

**内容**

- `sets`, `cards`, `storage_locations`（Boxes 吸収）
- 参照データ（Enums 相当）
- Excel / CSV → `COPY` / upsert スクリプト（[excel-to-postgres-mapping.md](./excel-to-postgres-mapping.md)）

**受け入れ基準**

- [excel-to-postgres-mapping.md](./excel-to-postgres-mapping.md) §10 の順で **FK 違反なく投入**できる。
- 行数が Excel と **主要テーブルで一致**（検証クエリをドキュメント化）。

---

## フェーズ 2: 在庫の正

**内容**

- `inventory_units`, `inventory_lots`
- `stock_movements`
- 移行: 既存 Inventory シート → movements + unit 解決

**受け入れ基準**

- 仕様書 F9 に基づき、**カード種別単位の在庫数**が SQL で再現できる。
- F4 を **トランザクション 1 本**で実行できる（[operations-and-edge-cases.md](./operations-and-edge-cases.md) §1）。

---

## フェーズ 3: OCR を DB のみに切替

**内容**

- `ocr_staging`, `processed_files`（Drive file ID 冪等）
- Cloud Run（または後継ジョブ）の **書き先を Sheets → DB API** に変更
- Vision / Gemini の切替・ハイブリッド（[ocr-pipeline.md](./ocr-pipeline.md)）

**受け入れ基準**

- 同一画像を二重投入しても **`processed_files` または UNIQUE 制約**で防げる。
- Inbox → DB 行 → Processed の **運用フロー**が [operations-and-edge-cases.md](./operations-and-edge-cases.md) §2 に沿う。

---

## フェーズ 4: 管理 Web（AppSheet 置換）

**内容**

推奨順（[decided-direction.md](./decided-direction.md) §5）に沿って画面を実装。

**受け入れ基準**

- 各サブフェーズで **AppSheet なし**で業務が完結する。
- 一覧 CSV エクスポート（仕様書 5.3）が **UTF-8 BOM** で出力できる。

---

## フェーズ 5: Shopify Phase A（計画どおり含める）

**内容**

- **1 card_id = 1 variant（集約 SKU）**
- `shopify_products`（product / variant / inventory_item / location ID）
- 商品作成・更新、在庫レベル同期
- `shopify_sync_jobs`（キュー・リトライ・エラー）

**受け入れ基準**

- テストストアで **商品作成 → 在庫更新**が再現できる。
- [shopify-integration.md](./shopify-integration.md) §2 の ID が `shopify_products` に保存される。

---

## フェーズ 6: Shopify 注文・冪等

**内容**

- Webhook 受信（Cloud Run / Functions）
- `shopify_webhook_events`（冪等キー）
- `orders`, `order_lines`
- 受注に基づく `stock_movements`（OUT / 引当消化）

**受け入れ基準**

- 同一 Webhook を **2 回送っても二重出庫しない**。
- HMAC 検証を **本番で必須**にできる。

---

## フェーズ 7: Shopify Phase B（計画）

**内容**

- 高額・個体単位 SKU（`shopify_products.target_type` / `target_id`）
- 必要に応じて listings / 同期ロジックの拡張

**受け入れ基準**

- 同一 `card_id` に **複数 variant** が存在し、在庫が混線しない。

---

## フェーズ 8: 相場・分析

**内容**

- `price_snapshots`
- ダッシュボード集計（読み取り最適化、バッチ集計可）

**受け入れ基準**

- 仕様書 SCR-015 の主要指標が **定義されたクエリまたは MV** で取得できる。

---

## 依存関係（概要）

```
[0 基盤] → [1 マスタ] → [2 在庫]
                ↓
[3 OCR→DB] ──→ [4 Web]
                ↓
         [5 Shopify A] → [6 注文]
                ↓
         [7 Shopify B]    [8 相場]
```

---

## リスク・依存

| リスク | 緩和 |
|--------|------|
| Excel 移行データの欠損 | 移行検証スクリプト + 手動サンプル確認（[open-questions-and-gaps.md](./open-questions-and-gaps.md)） |
| Shopify API 制限 | `shopify_sync_jobs` のバックオフ（[shopify-integration.md](./shopify-integration.md) §5） |
| 仕様書と実装のズレ | [verification-checklist.md](./verification-checklist.md) を定期的にレビュー |
