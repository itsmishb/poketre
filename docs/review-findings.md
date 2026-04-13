# 設計レビュー結果（見落とし・リスク整理）

更新日: 2026-04-06

`docs/` の論理設計・移行方針に対する **十分レビュー**の結果。実装前に潰すべきギャップと、すでに文書化済みの項目を分離する。

---

## 1. エグゼクティブサマリー

- **データドメイン（在庫・棚・Shopify・OCR）**は `data-model-detail.md` / `shopify-integration.md` / `ocr-pipeline.md` で **実装可能な粒度**まである。
- **見落としがちな領域**は、**(1) 管理 API の認証認可、(2) 観測可能性、(3) マイグレーション運用、(4) テスト戦略、(5) 本番とステージングの環境分離**である。これらは本書 §2 で整理し、**§4 の充当**でドキュメントまたは雛形を追加した。
- **製品仕様書**（`app/docs/システム仕様書.md`）はまだ **Sheets MVP 前提**のため、RDB 本番時は [open-questions-and-gaps.md](./open-questions-and-gaps.md) §2 の改訂が必須。

---

## 2. 見落とし・リスク一覧（重要度付き）

| ID | 領域 | 内容 | 重要度 | 状態 |
|----|------|------|--------|------|
| R1 | 認証・認可 | 同上 | 高 | ✅ **[recommended-architecture.md](./recommended-architecture.md) §2** + [development-flow.md](./development-flow.md) §4 で固定 |
| R2 | 観測可能性 | 構造化ログ、メトリクス、同期ジョブ失敗アラート、**Shopify / Drive のレート制限**の可視化 | 高 | development-flow §6 |
| R3 | マイグレーション | **スキーマ変更の単方向手順**（ロールバック方針、本番適用ゲート）が未整備 | 高 | `db/migrations/README.md` + development-flow §5 |
| R4 | テスト | **単体 / 契約 / E2E**の境界と、F4・在庫集計の **SQL 検証**の位置づけ | 中 | development-flow §7 |
| R5 | ローカル開発 | DB なしでは API 開発が進めにくい | 中 | **ルート `docker-compose.yml` を追加** |
| R6 | シークレット | ローテーション、ステージングと本番の **トークン分離** | 中 | development-flow §8 |
| R7 | 個人情報 | 作業者名・メールは **最小保持・ログマスキング**（要件次第） | 低〜中 | review §3 |
| R8 | 多言語・通貨 | 仕様は JPY 前提だが **Shopify 多通貨**を将来扱う場合の `orders.currency` 整合 | 低 | open-questions に既存 |
| R9 | 同時実行 | **F4 と OCR の同一カード競合**は低いが、**同一 Unit の同時掲載**はアプリロックが必要 | 中 | operations に一部あり → development-flow §9 |
| R10 | バックアウト | 移行失敗時の **Sheets に戻す**可否（計画のみ） | 低 | development-flow §10 |

---

## 3. 補足（カテゴリ別コメント）

### 3.1 認証・認可（R1）

- **Cloud Run（OCR）**は「サービスアカウント＋呼び出し元制限（Scheduler / 内部 API のみ）」が基本。
- **管理 Web**は IdP（Google Workspace / Auth0 等）を選定後、**ロール**（作業者 / 管理者）と **監査ログ**（誰が F4 したか）を `operators` 相当で保持する方針を決める。

### 3.2 観測可能性（R2）

- **同期ジョブ**は `shopify_sync_jobs` の `FAILED` 件数を Cloud Monitoring でアラートにする。
- **OCR**は `processed_files` の FAILED 率、処理時間をメトリクス化する。

### 3.3 法令・データ（R7）

- 決済データは Shopify 側に寄せる前提でも、**注文の氏名・住所**が DB に入るなら **保持期間と削除**を方針化する。

---

## 4. 今回の充当（追加した成果物）

| 成果物 | 役割 |
|--------|------|
| [development-flow.md](./development-flow.md) | ブランチ、環境、マイグレーション、DoD、テスト、リリース順 |
| ルート `docker-compose.yml` | ローカル PostgreSQL（開発用） |
| `db/migrations/README.md` | マイグレーションツール選定前の **運用ルール** |
| 本ファイル `review-findings.md` | レビュー結果の単一参照先 |

---

## 5. 次のアクション（優先順）

1. **認証プロバイダ**を決め、`development-flow.md` §4 に具体名を追記する。
2. **`app/docs/システム仕様書.md` 1.2**（RDB・Cloud Run DB 書き込み）を起票・改訂する。
3. マイグレーションツールを選び、`db/migrations/` に **初回 DDL** を置く。
4. [verification-checklist.md](./verification-checklist.md) に **R1〜R3 の項目**を追記する（任意）。

---

## 6. レビュー対象外（明示）

- **Shopify ストアの契約・手数料・税**（クライアント業務）。
- **スキャナー機器**（要件定義書どおり）。
- **Cloud Run 既存コードのリファクタ詳細**（別タスク）。
