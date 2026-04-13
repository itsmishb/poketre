# 開発フロー（環境・ブランチ・品質・リリース）

更新日: 2026-04-06

[roadmap.md](./roadmap.md) のフェーズと整合させる。**本リポジトリに Git が無い場合**でも、以下をチームの作業規約として使える。

---

## 1. 環境階層

| 環境 | 目的 | データ |
|------|------|--------|
| **local** | 開発者マシン | Docker PostgreSQL（`docker-compose.yml`）＋モック外部 API 可 |
| **staging** | 結合・移行検証 | Cloud SQL（ステージング）、テスト用 Shopify、Drive のテストフォルダ |
| **production** | 本番 | Cloud SQL（本番）、本番 Shopify、本番 Drive |

**原則**: 本番シークレットをローカルに置かない。`.env.local` は gitignore。

---

## 2. リポジトリ構成（目標）

現状に対し、次を **段階的に追加**する。

| パス | 内容 |
|------|------|
| `app/web/` | 管理 Web（Next.js） |
| `cloud_run_service/` | OCR バッチ（Sheets → 将来 DB） |
| `db/migrations/` | SQL マイグレーション（番号付き） |
| `docs/` | 設計・移行・本ドキュメント |
| `services/admin-api/` | **負荷時のみ**切り出す Hono API（初期は未作成でよい） |

**採用**: 管理 API の初期実装は **`app/web` の Route Handlers**。[recommended-architecture.md](./recommended-architecture.md) §1。

---

## 3. ブランチとマージ

**推奨（小〜中規模チーム）**

- `main`: 常に **ステージングへデプロイ可能**な状態を目指す。
- `feature/<短い説明>`: 機能・フェーズ単位。
- PR は **1 レビュア以上**（可能なら）でマージ。

**コミットメッセージ**: 日本語可。`feat:`, `fix:`, `docs:` 等のプレフィックス推奨。

---

## 4. 認証・認可（採用）

| コンポーネント | 認証 |
|----------------|------|
| 管理 Web | **Google OAuth 2.0**（**Auth.js / NextAuth v5**）。必要なら **Workspace hd 制限** |
| 管理 API | **Web と同一セッション**（BFF）または **Bearer JWT 検証** |
| OCR Cloud Run | **Scheduler OIDC** + Invoker。**共有シークレットは使わない** |
| OCR → 管理 API | **サービスアカウント IAM**（必要時） |

**ロール**: `operator` / `admin`（`app_users.role` + CHECK）。

**監査**: **`audit_log` テーブル**（[recommended-architecture.md](./recommended-architecture.md) §2）。

---

## 5. データベースマイグレーション

- **ツール**: **golang-migrate**。**単一の真実**: `db/migrations/*.sql`。
- **適用順**: local → staging で検証 → production（メンテ窓または低トラフィック時）。
- **ロールバック**: 破壊的変更は **forward-only + 補償トランザクション**を原則とし、**ダウンマイグレーション**は開発用のみに限定する運用でもよい。

詳細: [db/migrations/README.md](../db/migrations/README.md)。

---

## 6. 観測可能性

- **ログ**: JSON 一行、**`correlation_id`**（HTTP / ジョブ）を付与。
- **メトリクス**: OCR 処理時間、同期ジョブ成功/失敗件数、DB 接続プール。
- **アラート**: `shopify_sync_jobs` の連続 FAILED、Webhook 処理失敗率、Cloud SQL ディスク。

---

## 7. テスト戦略（採用）

| レイヤ | ツール / 対象 | タイミング |
|--------|----------------|------------|
| 単体 | **Vitest**（TS）/ **pytest**（Python） | PR 毎 |
| 統合 | **staging** または **Testcontainers**（任意） | PR / 日次 |
| 契約 | Shopify Webhook ペイロードのパース | 変更時 |
| E2E | **Playwright**（ログイン→登録待ち→F4） | リリース前 |

**SQL 検証**: [open-questions-and-gaps.md](./open-questions-and-gaps.md) §5 の「サンプルデータで F4 / 集計を試す」を **staging の定例**に含める。

---

## 8. シークレット

- **Secret Manager**（GCP）に集約。環境ごとに **別バージョン**。
- Shopify **Admin API** と **Webhook secret** は分離。
- **ローテーション手順**を Runbook に 1 ページ残す（クォータ再発行時）。

---

## 9. 同時実行・ロック

- **F4**: 同一 `stg_id` に対する二重提交は **DB UNIQUE + アプリでボタン連打防止**。
- **掲載**: 同一 `inventory_unit_id` の複数 `LISTED` は **トランザクション内で検証**（[operations-and-edge-cases.md](./operations-and-edge-cases.md) §6）。

---

## 10. リリース順（RDB 本番切替の例）

1. Cloud SQL 本番作成・バックアップ有効化  
2. マイグレーション適用  
3. データ移行（読み取り検証）  
4. 管理 API デプロイ（読み取りのみ可）  
5. 管理 Web 切替  
6. OCR Cloud Run を **DB 書き込み**に切替（メンテ短時間）  
7. Sheets / AppSheet を読み取り専用または廃止  

**ロールバック**: 計画 B（Sheets に戻す）は **データ二重化期間**が必要なため、初回は **短いメンテ**で完結させる方が現実的。

---

## 11. フェーズゲート（roadmap との対応）

各 [roadmap.md](./roadmap.md) フェーズの **受け入れ基準**を満たすまで次フェーズに進まない。抜け漏れは [verification-checklist.md](./verification-checklist.md) で確認。

---

## 12. 関連ドキュメント

- [review-findings.md](./review-findings.md): 見落とし一覧  
- [decided-direction.md](./decided-direction.md): 製品方針  
- [operations-and-edge-cases.md](./operations-and-edge-cases.md): 運用境界  
