# 仕様の網羅性チェックリスト

更新日: 2026-04-06

`docs/` 配下の方針が **実装・移行に足るか**を確認するための一覧。項目がすべて埋まれば「細部まで詰まった」とみなせる。

---

## A. データモデル

| # | 項目 | 状態 | 参照 |
|---|------|------|------|
| A1 | `cards.card_id` 生成規則と重複時のサフィックス | ✅ [data-model-detail.md](./data-model-detail.md) | 仕様書 F4 |
| A2 | `serial_number`（人が読む識別子）と `card_id` の関係 | ✅ | 同上 |
| A3 | Unit と Lot のどちらをいつ作るか（F4 / `approved_inventory_type`） | ✅ | decided-direction, 仕様書 |
| A4 | `stock_movements` の RESERVE | ✅ **`qty_delta=0` + reserved_qty/list_qty/status** | [recommended-architecture.md](./recommended-architecture.md) §4.1 |
| A5 | `inventory_reservations` テーブル | ✅ **Phase A〜B は作らない** | [data-model-detail.md](./data-model-detail.md) §6 |
| A6 | `storage_locations` の階層深さ・必須フィールド | ✅ | data-model-detail |
| A7 | Excel `CardLocations` の移行アルゴリズム（1 card 複数 slot 等） | ✅ | [excel-to-postgres-mapping.md](./excel-to-postgres-mapping.md) |
| A8 | `listings` と `shopify_products` の責務分離 | ✅ | [shopify-integration.md](./shopify-integration.md) |

---

## B. OCR・取込

| # | 項目 | 状態 | 参照 |
|---|------|------|------|
| B1 | `ocr_staging` の必須列・インデックス | ✅ | data-model-detail, ocr-pipeline |
| B2 | `processed_files` と Drive フォルダ移動の順序（失敗時の整合） | ✅ | [operations-and-edge-cases.md](./operations-and-edge-cases.md) |
| B3 | 同一画像の再実行・重複 `stg_id` | ✅ | ocr-pipeline |
| B4 | Vision / Gemini のフォールバック条件 | ✅ | ocr-pipeline |

---

## C. Shopify

| # | 項目 | 状態 | 参照 |
|---|------|------|------|
| C1 | Phase A: 1 card = 1 variant のマッピング | ✅ | shopify-integration |
| C2 | `inventory_item_id` と `location_id` の取得タイミング | ✅ | 同上 |
| C3 | Webhook 冪等キー（`X-Shopify-Event-Id` 等） | ✅ | 同上 |
| C4 | 注文取り込み後の `stock_movements` と在庫ステータス | ✅ | 同上, operations |

---

## D. 非機能・運用

| # | 項目 | 状態 | 参照 |
|---|------|------|------|
| D1 | DB トランザクション境界（F4 一連処理） | ✅ | operations-and-edge-cases |
| D2 | Cloud Run と管理 API の認可（サービスアカウント） | ✅ | ocr-pipeline, operations |
| D3 | `app/docs/システム仕様書.md` §5.1 の「Sheets API」記述の更新タイミング | ⚠️ **RDB 切替時に改訂** | [open-questions-and-gaps.md](./open-questions-and-gaps.md) §2 |

---

## E. 既知のギャップ（製品仕様書側）

以下は **`app/docs/システム仕様書.md` の将来改訂**で明文化するとよい項目。

- §5.1 データストアを **PostgreSQL** に差し替えた記述
- §6.2 Cloud Run を **「DB 直書き可」** に更新（OCR のみ対象、と注記）

`docs/` 側では [open-questions-and-gaps.md](./open-questions-and-gaps.md) に転記済み。

---

## F. 開発プロセス・非機能（レビュー追補）

| # | 項目 | 状態 | 参照 |
|---|------|------|------|
| F1 | 管理 Web / API の認証・ロール・監査ログ方針 | ✅ 方針記載 | [development-flow.md](./development-flow.md) §4 |
| F2 | 観測可能性（ログ・メトリクス・アラート） | ✅ 方針記載 | development-flow §6 |
| F3 | マイグレーション運用・本番適用ゲート | ✅ | [db/migrations/README.md](../db/migrations/README.md), development-flow §5 |
| F4 | ローカル DB（Docker） | ✅ | ルート `docker-compose.yml` |
| F5 | シークレット・環境分離 | ✅ 方針記載 | development-flow §8 |
| F6 | テスト戦略（単体・統合・E2E） | ✅ 方針記載 | development-flow §7 |
| F7 | リリース順・ロールバックの考え方 | ✅ | development-flow §10 |

詳細な **見落とし ID（R1〜）** は [review-findings.md](./review-findings.md)。
