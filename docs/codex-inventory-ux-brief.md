# Codex 向け実装ブリーフ: 在庫一覧 UX 改善

## ミッション
`/inventory` ページ(`app/web/app/(dashboard)/inventory/page.tsx`)を、トレカ買取販売業者向けの実運用に耐える画面に引き上げる。現状は単純なテーブル。目標は「販売管理画面」。

参考: 遊々亭、Cardrush、晴れる屋2、Hareruya2、TCGPlayer Pro。

## スコープ(GitHub issues)
優先順に実装。1 issue = 1 PR が原則。依存がある場合は本文の「依存」欄参照。

### フェーズ1: 情報密度(最優先)
1. [#10](https://github.com/itsmishb/poketre/issues/10) 検索ボックス + 複数条件フィルタ
2. [#11](https://github.com/itsmishb/poketre/issues/11) 列ソート
3. [#12](https://github.com/itsmishb/poketre/issues/12) カード画像サムネイル
4. [#13](https://github.com/itsmishb/poketre/issues/13) 在庫日数/滞留バッジ
5. [#20](https://github.com/itsmishb/poketre/issues/20) 密度トグル + 表示列カスタマイズ

### フェーズ2: 販売 KPI
6. [#18](https://github.com/itsmishb/poketre/issues/18) 参考市場価格列 ※外部ソース調査から
7. [#19](https://github.com/itsmishb/poketre/issues/19) 粗利率 + 週間販売数 ※Shopify 注文データ蓄積後

### フェーズ3: 業務フロー
8. [#14](https://github.com/itsmishb/poketre/issues/14) 行複数選択 + 一括操作バー
9. [#16](https://github.com/itsmishb/poketre/issues/16) バーコードスキャン
10. [#17](https://github.com/itsmishb/poketre/issues/17) CSV エクスポート/インポート

### フェーズ4: 可視化
11. [#15](https://github.com/itsmishb/poketre/issues/15) サマリータイル

**着手順の推奨**: #10 → #11 → #13 → #20 → #12 → #15 → #14 → #16 → #17 → #18 → #19。
理由: #10/#11 は他すべての基盤。#13/#20 はスキーマ追加が軽い。#12 は image_url 取得設計が必要で少し重い。#14 以降は API 側の拡張が絡む。#18/#19 は外部/データ待ち。

## アーキテクチャ前提

### スタック
- Next.js 15 App Router, React 19, TypeScript, Tailwind v3
- shadcn/ui + Radix + lucide-react(既存コンポーネントを必ず使う、新規導入は最小限)
- PostgreSQL 16(マイグレーションは `db/migrations/` に連番 `.up.sql`/`.down.sql`)
- Supabase クライアント(`@/lib/supabase/server`), pg Pool(`@/lib/db/pool`)
- デモモード(`isDemoMode`)で `lib/demo-data.ts` の固定データを返す二重実装

### コード規約
- Server Component 優先。Client は必要な部分(フォーム/選択状態/スキャン)だけ `"use client"` で切り出す
- URL searchParams を第一級の状態に。ブックマーク/共有/リロード復元を常に考慮
- 新規ファイル作成は最小限。既存の `app/(dashboard)/inventory/` 配下に追加
- フィルタ/ソート関数は `lib/inventory/` に切り出して、デモデータ配列でもDB取得結果でも使える形に
- 日本語 UI。ラベルは既存画面の語彙に合わせる(「カード識別子」「コンディション」「在庫状態」等)
- Tailwind のみ。CSS Modules や styled-components は使わない
- `@/` パスエイリアス(`app/web/tsconfig.json` 参照)

### 既に適用済み(触らないで)
[app/web/app/(dashboard)/inventory/page.tsx:186-226](app/web/app/(dashboard)/inventory/page.tsx#L186) の列整理:
- 順序: カード識別子 / カード名 / コンディション / 数量 / 管理単位 / 保管場所 / 在庫状態 / 取得原価 / 操作
- ラベル変更: 「状態」→「コンディション」、「ステータス」→「在庫状態」
- `棚座標` と `保管場所` の重複列を統合

各 issue 実装時もこの順序を維持。列を追加する場合の挿入位置は各 issue 本文に従う。

### データモデルの要所
- `inventory_units` = 単枚(qty 常に1)、`inventory_lots` = ロット(qty_on_hand)
- `storage_locations` (tier, box, column) で棚座標を表現
- `stock_movements` は全ての数量変動ログ。棚移動/出品/販売/調整はすべてここに記録
- `shopify_*` テーブル群は Shopify 連携用(`docs/shopify-integration.md`)

### デモデータ
`app/web/lib/demo-data.ts` の `DemoInventoryRow` を拡張した場合、以下も確認/更新:
- `app/(dashboard)/inventory/[id]/page.tsx`
- `getDemoInventoryInBox` / `getDemoInventoryByColumnsInBox`
- `lib/storage-layout.ts`

### 開発環境
`.claude/launch.json` に4つの dev server 定義:
- `web (Next.js)`: `npm run dev --prefix app/web` (port 3000)
- `shopify-worker`: `npm run shopify:worker --prefix app/web`
- `postgres (docker compose)`: `docker compose up` (port 5432)
- `cloud-run-service (Flask)`: gunicorn (port 8080)

在庫一覧の作業では web + postgres があれば十分。

### テスト/検証
- 現状自動テストは最小限。実装後は必ずブラウザで動作確認:
  - デモモードで `/inventory` が開ける
  - フィルタ/ソート/タブ切替の組み合わせで結果が期待通り
  - URL 直リンクで状態復元
- 型チェック: `npm run build --prefix app/web`(本番ビルドで型エラー検出)
- Lint: `npm run lint --prefix app/web`(ESLint v9 flat config)
- CI は lint + build。両方通るまで PR マージ不可

## PR 運用

### ブランチ/コミット
- ブランチ名: `inventory/<issue-number>-<slug>`(例: `inventory/10-search-filter`)
- コミットメッセージ: Conventional Commits(`feat(inventory): add search box`)
- 1 issue = 1 PR、本文に `Closes #<number>` を記載

### PR description
- 変更内容の要約
- スクリーンショット(変更前/後)必須
- 動作確認手順(デモモードでの操作例)
- 影響範囲(触ったファイル、追加/変更したスキーマ、localStorage キー等)

### レビュー観点
- 既存のデザイントークン(shadcn/Tailwind の色/spacing)を使っているか
- Server Component のままで良い部分を Client に切り出していないか
- URL 状態と localStorage 状態の切り分けが妥当か
- デモモード + 本番DBモードの両方で動くか

## 共通の禁じ手
- 新しい状態管理ライブラリを入れない(Redux/Zustand/Jotai 等)。URL + useState で足りる
- shadcn で足りる UI に別ライブラリを持ち込まない(Material/Chakra/Ant 等)
- `any` 型で逃げない。型が複雑なら `lib/inventory/types.ts` に定義を集約
- TODO コメントを残さない。やらないなら issue 化
- コメントは「なぜ」だけ書く。「何をしているか」はコード自体が説明すべき

## 疑問があれば
- データモデル: `docs/data-model-detail.md`
- Shopify 連携: `docs/shopify-integration.md`
- 既存の UI 方針: `docs/ui-ux-redesign-plan.md`
- ロードマップ: `docs/roadmap.md`
- 不明点は issue コメントで質問、勝手に仕様を決めない
