# Poketre ドキュメント索引

本ディレクトリは、基幹 DB 移行・OCR・AppSheet 廃止・Shopify 連携に関する **確定方針・論理設計・移行手順**をまとめたものです。

詳細な画面仕様・列定義のフルセットは `app/docs/`（要件定義書・システム仕様書等）を参照してください。**矛盾がある場合は `app/docs` の製品仕様を優先**し、`docs/` を追随して更新します。

---

## 核となる文書

| ドキュメント | 内容 |
|--------------|------|
| **[recommended-architecture.md](./recommended-architecture.md)** | **推奨設計の正本**（スタック・認証・Shopify・OCR・テストをすべて固定） |
| [decided-direction.md](./decided-direction.md) | 製品方針（在庫モデル、棚、Shopify、OCR、AppSheet 廃止順） |
| [data-model-detail.md](./data-model-detail.md) | 論理テーブル・FK・識別子（本書と矛盾時は recommended を優先） |
| [excel-to-postgres-mapping.md](./excel-to-postgres-mapping.md) | `ref/システムdb.xlsx` 列レベル対応・CardLocations 移行アルゴリズム |
| [shopify-integration.md](./shopify-integration.md) | Shopify ID、同期、Webhook 冪等、Phase A/B |
| [ocr-pipeline.md](./ocr-pipeline.md) | DB 直書き、カラム一覧、フォールバック、設定 |
| [operations-and-edge-cases.md](./operations-and-edge-cases.md) | F4 トランザクション、OCR と Drive の順序、並行、二重販売 |
| [roadmap.md](./roadmap.md) | フェーズ 0〜8 と **受け入れ基準** |

---

## メタ・検証・開発プロセス

| ドキュメント | 内容 |
|--------------|------|
| [review-findings.md](./review-findings.md) | **設計レビュー**（見落とし・リスク・充当一覧） |
| [development-flow.md](./development-flow.md) | **開発フロー**（環境・ブランチ・マイグレーション・テスト・リリース順） |
| [verification-checklist.md](./verification-checklist.md) | 網羅性チェックリスト（詰まったかの確認用） |
| [open-questions-and-gaps.md](./open-questions-and-gaps.md) | 製品仕様書への改訂依頼・残るビジネス判断 |
| [local-setup-troubleshooting.md](./local-setup-troubleshooting.md) | Docker / migrate / psql が無いときの手順 |

## リポジトリ直下の開発用ファイル

| パス | 内容 |
|------|------|
| `docker-compose.yml` | ローカル PostgreSQL（開発専用パスワード） |
| `db/migrations/README.md` | マイグレーション運用ルール |
| `db/migrations/000001_initial_schema.up.sql` | **初回 DDL**（論理モデルの物理化） |

---

## 関連パス

| パス | 説明 |
|------|------|
| `app/docs/システム仕様書.md` | 画面・データ仕様（F4, F9, F13–F15） |
| `app/docs/要件定義書.md` | 要件・スコープ |
| `ref/システムdb.xlsx` | 現行 Excel 台帳（移行元） |
| `cloud_run_service/main.py` | 現行 OCR（Sheets 追記）実装 |
