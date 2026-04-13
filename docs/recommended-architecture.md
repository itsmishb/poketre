# 推奨設計（全項目の確定案）

更新日: 2026-04-06

本ドキュメントは、実装時に **選択肢があった箇所をすべて推奨で固定**したものである。別案が必要になった場合は本書を改訂し、関連 `docs/` を追随する。

**優先順位**: 本書 → [decided-direction.md](./decided-direction.md) → `app/docs/システム仕様書.md`（製品文言は仕様書を優先し、技術選択は本書を優先してよい）。

---

## 1. スタック・アーキテクチャ

| 領域 | 推奨 |
|------|------|
| RDB | **Cloud SQL PostgreSQL 16** |
| 管理 Web | **Next.js（App Router）**（既存 `app/web/` を拡張） |
| 管理 API（初期） | **Next.js Route Handlers**（`app/api/**/route.ts`）。トラフィック・チーム分離が必要になったら **`services/admin-api`（TypeScript + Hono）** に切り出す |
| OCR バッチ | **Cloud Run（Python 継続可）**。長期はモジュール分割 |
| マイグレーション | **[golang-migrate](https://github.com/golang-migrate/migrate)** + `db/migrations/*.sql`（番号プレフィックス） |
| IaC | **Terraform**（Cloud SQL / Cloud Run / Scheduler / Secret Manager を段階導入） |
| コンテナレジストリ | **Artifact Registry** |

---

## 2. 認証・認可

| コンポーネント | 推奨 |
|----------------|------|
| 管理 Web | **Google OAuth 2.0**（**NextAuth.js v5 / Auth.js**）。組織利用なら **Workspace の hd（hosted domain）制限**を環境変数で指定可能にする |
| 管理 API | **同一の JWT / セッション**（BFF パターン: Web が API をプロキシ、または Bearer 検証） |
| サービス間（OCR → API） | **IAM 認証付き**（Cloud Run 呼び出し元サービスアカウント）。共有シークレットは使わない |
| Scheduler → OCR Cloud Run | **OIDC トークン** + Invoker 権限 |
| ロール | **`operator`**（作業者）、**`admin`**（マスタ・同期・設定）。DB は `app_users.role` text + CHECK |
| 監査 | **`audit_log` テーブル**（`actor_id`, `action`, `entity`, `entity_id`, `payload jsonb`, `occurred_at`）。F4・在庫・掲載・同期を記録 |

---

## 3. 識別子・キー型

| 対象 | 推奨 |
|------|------|
| 新規 PK（内部） | **`uuid`**、`DEFAULT gen_random_uuid()` |
| `cards.card_id` | 仕様どおり **テキスト**（`{set_code}-{card_number}-{rarity}` + 重複時サフィックス） |
| `stg_id` | **`stg_{drive_file_id}`**（Drive 追跡を最優先） |
| Shopify ID 列 | **`bigint`**（GraphQL の gid はアプリ層で変換して保存してもよいが、保存は数値に正規化推奨） |

---

## 4. データモデル上の固定

### 4.1 在庫・引当

| 項目 | 推奨 |
|------|------|
| RESERVE | **`movement_type=RESERVE` かつ `qty_delta=0`**。数量は **`listings.reserved_qty`（= `list_qty` と同値で開始）** + Unit/Lot の **`status`** |
| `inventory_reservations` テーブル | **Phase A〜B では作らない**（`listings` + movements + status で足りる） |
| 棚移動（TRANSFER） | **1 トランザクション**: 対象 Unit/Lot の **`storage_location_id` を更新**し、`stock_movements` に **1 行**（`movement_type=TRANSFER`, `qty_delta=0`, **`metadata jsonb`** に `from_storage_location_id`, `to_storage_location_id`） |

### 4.2 `storage_locations`

| 項目 | 推奨 |
|------|------|
| `storage_location_id` | **uuid** |
| `capacity` | **NULL 可**（不明なら NULL） |
| `inventory_units.storage_location_id` | **NULL 可**（未割当を許容。F4 時に必須入力なら NOT NULL に変更可） |
| `inventory_units.serial_number` | **持つ**（Excel `serial_no` 移行・人間検索用） |

### 4.3 列挙値（Enums）

| 項目 | 推奨 |
|------|------|
| DB | **`text` + CHECK 制約**（マイグレーションで列挙を明示）。PostgreSQL の ENUM 型は **避ける**（変更時のマイグレが重いため） |
| アプリ | **TypeScript const / zod** と二重管理（生成は将来検討） |

### 4.4 同期ジョブテーブル

| 項目 | 推奨 |
|------|------|
| 汎用 | **`sync_jobs`**（`job_type`, `status`, `payload`, `error`, `schedule` 互換の `next_run_at`） |
| Shopify 高頻度 | **`shopify_sync_jobs`** を **別テーブルで維持**（インデックス・クエリを単純化） |

---

## 5. Shopify（Phase A）

| 項目 | 推奨 |
|------|------|
| 在庫同期の数量ソース | **在庫可能数（仕様書 F9）を正とする**。`available = max(0, 在庫可能数)` を Shopify に送信。`listings.list_qty` は **掲載レコードの希望・表示用**であり、**Shopify の available を上回る値は送らない**（clamp） |
| `shopify_location_id` | **環境変数でデフォルト 1 つ** + 管理画面で上書き可能（マルチロケーションは Phase B 以降） |
| Webhook | **必須**。**`X-Shopify-Event-Id`** を冪等キー。HMAC 検証必須 |
| ポーリング | **Webhook の補完**として 15 分毎 `IMPORT_ORDERS`（[roadmap](./roadmap.md) と整合） |

---

## 6. OCR

| 項目 | 推奨 |
|------|------|
| 既定エンジン | **`hybrid`**: 主 **Gemini（構造化 JSON）**、失敗・低 confidence 時 **Vision（DOCUMENT_TEXT_DETECTION）** でテキスト取得 → 同一スキーマに正規化 |
| `ocr_staging.drive_file_id` | **NOT NULL UNIQUE** |
| `processed_files` | **成功時のみ INSERT**。失敗は **`ocr_staging` に `processing_error` 列**または別 **`ocr_failures`** は作らず、`processed_files.status=FAILED` で足りる |

---

## 7. ビジネス状態（open-questions の充足）

| 項目 | 推奨 |
|------|------|
| `SOLD` → `SHIPPED` | **倉庫が「発送完了」操作**したタイミングで Unit/Lot の `status=SHIPPED`。その前は **`SOLD`**（売約済・未発送） |
| 返品・キャンセル（初期） | **手動**: `stock_movements` に **`movement_type=ADJUST`**, **`ref_kind=RETURN`**, `qty_delta` 正。Shopify 側は管理画面で別途対応。自動返金連携はスコープ外 |

---

## 8. テスト・CI

| 項目 | 推奨 |
|------|------|
| 単体 | **Vitest**（`app/web` と共有）または **pytest**（Python） |
| API 統合 | **staging** への smoke、または **Testcontainers Postgres**（GitHub Actions は任意） |
| E2E | **Playwright**（クリティカルパスのみ） |
| CI | **Git 導入後**: `lint` + `typecheck` + `test` on PR。マイグレは **staging 手動承認後**に本番 |

---

## 9. 観測可能性

| 項目 | 推奨 |
|------|------|
| ログ | **Cloud Logging**、JSON ペイロード、**`correlation_id`** |
| トレース | **Cloud Trace**（Cloud Run 標準）を有効化 |
| アラート | **Error Reporting** + `shopify_sync_jobs` 連続 FAILED のメトリクスアラート |

---

## 10. Excel 移行

| 項目 | 推奨 |
|------|------|
| CardLocations | **パターン A**（既存 Unit があれば `storage_location_id` 更新）。無ければ **Unit 生成後に紐づけ** |
| `_Internal_Processed_Files` | **手動で `drive_file_id` 列を抽出**し `processed_files` へ |

---

## 11. AppSheet 廃止順

[decided-direction.md](./decided-direction.md) §5 の表を **変更せず採用**（既に推奨順として確定済み）。

---

## 12. 関連ドキュメントの役割

| ドキュメント | 内容 |
|--------------|------|
| **本書** | 技術・運用の **選択肢をすべて固定** |
| [data-model-detail.md](./data-model-detail.md) | 列・FK の **論理詳細**（本書と矛盾したら本書を優先して data-model を修正） |
| [shopify-integration.md](./shopify-integration.md) | API フロー詳細（本書 §5 と整合） |
| [development-flow.md](./development-flow.md) | プロセス（本書 §2・§8 と整合） |
