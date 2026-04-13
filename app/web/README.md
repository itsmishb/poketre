# カード管理システム（Poketre）Web アプリ

要件定義書・システム仕様書・UI 要件定義書に基づく Next.js + Supabase の管理画面です。

## 技術スタック

- **Next.js 15**（App Router）
- **TypeScript**
- **Tailwind CSS**
- **Supabase**（認証・PostgreSQL）

## セットアップ

1. 依存関係のインストール

   ```bash
   cd web && npm install
   ```

2. 環境変数（任意）

   **Supabase 接続なしでも確認できます。** 環境変数を設定しない場合は**デモモード**で起動し、ログイン不要でダッシュボード以降の画面を表示します。画面上部に「デモモード（Supabase 未接続）」のバーが表示されます。

   Supabase を接続する場合のみ、`.env.local.example` をコピーして `.env.local` を作成し、Supabase の URL と anon key を設定してください。

   ```bash
   cp .env.local.example .env.local
   ```

3. Supabase を接続する場合: プロジェクトで認証を有効化（Email/Password）し、必要に応じて `ocr_staging` 等のテーブルを作成します。テーブル未作成でもログイン・ダッシュボード・各ページの骨子は動作します。

4. 開発サーバー起動

   ```bash
   npm run dev
   ```

   http://localhost:3000 で開きます。

   - **デモモード**（`.env.local` 未設定または Supabase URL 未設定）: トップ `/` でダッシュボードが表示されます。`/login` では「ダッシュボードへ進む」ボタンでそのまま進めます。
   - **Supabase 接続時**: 未認証時は `/login` にリダイレクトされます。

## ディレクトリ構成（要約）

- `app/` - App Router のページ・レイアウト
  - `(auth)/` - ログイン等
  - `(dashboard)/` - 認証後の画面（ダッシュボード、登録待ち、カード種別、在庫、掲載、設定 等）
- `components/` - 共通コンポーネント（サイドバー等）
- `lib/` - Supabase クライアント、型定義
- `app/api/` - API ルート（登録待ちの承認・却下等）

## 表示言語

UI はすべて**日本語**です（タイトル、ラベル、ボタン、エラーメッセージ）。

## Supabase テーブル（作成順の例）

1. `ocr_staging` - Cloud Run が書き込む列に加え、本システム用に `id`（uuid）、`review_status`、`reviewer_id`、`approved_at`、`initial_qty`、`initial_condition`、`storage_location_id`、`approved_inventory_type`、`created_at`、`updated_at` を用意
2. `sets`、`card_catalog`、`inventory_units`、`inventory_lots`、`stock_movements`、`storage_locations`、`channel_listings`、`channel_products`、`channel_orders`、`price_snapshots`、`sync_jobs` は仕様書のカラム定義に従って作成

詳細は `../docs/システム仕様書.md` を参照してください。
