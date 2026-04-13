# データベースマイグレーション

PostgreSQL（Cloud SQL）向け。**ツールは [golang-migrate](https://github.com/golang-migrate/migrate) に固定**（[recommended-architecture.md](../docs/recommended-architecture.md) §1）。

## ファイル命名

```
db/migrations/
  000001_initial_schema.up.sql     # 初回スキーマ（実装済み）
  000001_initial_schema.down.sql
  000002_updated_at_triggers.up.sql  # updated_at 自動更新トリガ
  000002_updated_at_triggers.down.sql
```

`000001` には次が含まれる: `sets`, `cards`, `storage_locations`, `app_users`, `inventory_units`, `inventory_lots`, `stock_movements`, `ocr_staging`, `listings`, `shopify_products`, `shopify_sync_jobs`, `shopify_webhook_events`, `orders`, `order_lines`, `price_snapshots`, `sync_jobs`, `processed_files`, `audit_log`。

## ローカルでの適用例

**golang-migrate が無い場合**（`psql` も不要）:

```bash
cd app/web
export DATABASE_URL='postgres://poketre:poketre_dev@localhost:5432/poketre?sslmode=disable'
npm run db:migrate
```

**migrate CLI**（Homebrew）:

```bash
brew install golang-migrate
docker compose up -d   # または別途 Postgres を起動
export DATABASE_URL='postgres://poketre:poketre_dev@localhost:5432/poketre?sslmode=disable'
migrate -path db/migrations -database "$DATABASE_URL" up
migrate -path db/migrations -database "$DATABASE_URL" down 1   # 開発のみ
```

Node スクリプトは `schema_migrations` テーブルにバージョンを記録します（golang-migrate と同じ名前・用途）。

## 運用ルール

1. **1 PR 原則 1 up マイグレーション**（レビューしやすくする）。
2. **本番**は **メンテ窓または低トラフィック**で `up`。破壊的変更は **補償トランザクション**または **複数段階リリース**。
3. 論理モデルの正: [docs/data-model-detail.md](../docs/data-model-detail.md)、技術スタックの正: [docs/recommended-architecture.md](../docs/recommended-architecture.md)。

## 初回 DDL

`000001_initial_schema.up.sql` は別 PR で追加する（本 README のみ先行している状態）。
