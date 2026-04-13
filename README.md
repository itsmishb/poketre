# Poketre 🃏

ポケモンカードの在庫管理・販売補助システム。
スキャン画像を AI（Gemini Vision）で自動読み取りし、カード情報を登録・管理する。

---

## アーキテクチャ

```
Browser
  │
  ▼
Next.js 15 (App Router)          ← app/web/
  ├─ /staging/import             … 画像アップロード UI
  ├─ /staging                    … 登録待ち一覧・確認・編集
  ├─ /api/staging/import         … GCS 保存 + Cloud Tasks エンキュー
  ├─ /api/ocr/process-job        … OCR ワーカー（Cloud Tasks から呼ばれる）
  └─ /api/staging/batch-status   … バッチ進捗ポーリング
       │
       ├─ Google Cloud Storage   … 元画像保存 (ocr-uploads/)
       ├─ Cloud Tasks            … 非同期 OCR キュー (1 task = 1 card)
       ├─ Gemini 2.5 Flash       … カード情報抽出（底部ストリップ優先）
       ├─ TCGdex API             … 公式データで補完 (tcgdex.net/v2/ja)
       └─ PostgreSQL 16          … ocr_jobs / ocr_staging / cards
```

### OCR パイプライン（v2）

```
画像アップロード（最大 500 枚）
  → GCS 保存 + ocr_jobs 登録
  → Cloud Tasks にエンキュー（非同期）
    → Gemini 2.5 Flash で解析
      → confidence ≥ 0.7 かつ識別フィールドあり
        → TCGdex API で公式データ補完
    → ocr_staging に保存
  → フロントが 5 秒ポーリングで進捗表示
  → 完了後、人間が確認・承認 → cards テーブルへ正式登録
```

---

## ディレクトリ構成

```
poketre/
├── app/
│   └── web/                    # Next.js 15 アプリケーション
│       ├── app/                # App Router（ページ・API routes）
│       ├── components/         # React コンポーネント
│       ├── lib/                # サーバーライブラリ（OCR, DB, GCP）
│       └── scripts/            # DB マイグレーション実行スクリプト
├── cloud_run_service/          # 旧 Python OCR ワーカー（廃止予定）
├── db/
│   └── migrations/             # PostgreSQL マイグレーション（連番 SQL）
├── docs/                       # 設計書・実装指示書
├── .github/
│   └── workflows/              # GitHub Actions CI
├── docker-compose.yml          # ローカル PostgreSQL
└── Makefile                    # 開発用ショートカット
```

---

## ローカル開発セットアップ

### 必要なもの

- Node.js 20+
- Docker Desktop（PostgreSQL 用）
- Google Cloud SDK（`gcloud auth application-default login`）
- GitHub CLI（`gh`）

### 手順

```bash
# 1. リポジトリをクローン
git clone https://github.com/itsmishb/poketre.git
cd poketre

# 2. 依存関係インストール
cd app/web
npm install

# 3. 環境変数を設定
cp .env.local.example .env.local
# .env.local を編集（DATABASE_URL, GOOGLE_CLOUD_PROJECT 等）

# 4. PostgreSQL 起動
cd ../..
docker compose up -d postgres

# 5. DB マイグレーション
cd app/web
npm run db:migrate

# 6. 開発サーバー起動
npm run dev
# → http://localhost:3000
```

### 環境変数一覧

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `DATABASE_URL` | 推奨 | PostgreSQL 接続 URL。未設定時はデモモード |
| `GOOGLE_CLOUD_PROJECT` | 本番 | GCP プロジェクト ID |
| `GCS_BUCKET` | 本番 | 画像保存先 GCS バケット |
| `CLOUD_TASKS_LOCATION` | 本番 | Cloud Tasks リージョン（例: asia-northeast1） |
| `CLOUD_TASKS_QUEUE` | 本番 | Cloud Tasks キュー名 |
| `CLOUD_TASKS_WORKER_URL` | 本番 | OCR ワーカー URL（自アプリの `/api/ocr/process-job`） |
| `CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL` | 任意 | Tasks→Worker の OIDC 認証用 SA |
| `OCR_WORKER_SHARED_SECRET` | 推奨 | ワーカーエンドポイントの共有シークレット |
| `GEMINI_MODEL` | 任意 | デフォルト: `gemini-2.5-flash-preview-04-17` |
| `VERTEX_AI_LOCATION` | 任意 | デフォルト: `asia-northeast1` |
| `TCGDEX_API_BASE` | 任意 | デフォルト: `https://api.tcgdex.net/v2/ja` |
| `NEXT_PUBLIC_SUPABASE_URL` | 任意 | Supabase 認証用（未設定時はデモモード） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 任意 | Supabase 認証用 |

---

## DB マイグレーション

マイグレーションファイルは `db/migrations/` に連番で管理する。

```bash
# アップ（最新まで適用）
cd app/web && npm run db:migrate

# 手動適用
psql $DATABASE_URL -f db/migrations/000006_ocr_jobs_v2.up.sql

# ロールバック
psql $DATABASE_URL -f db/migrations/000006_ocr_jobs_v2.down.sql
```

### マイグレーションファイル命名規則

```
NNNNNN_<snake_case_description>.<up|down>.sql
例:
  000001_init.up.sql
  000006_ocr_jobs_v2.up.sql
  000006_ocr_jobs_v2.down.sql
```

---

## 開発ルール

### ブランチ戦略

```
main        ← 本番環境。直接 push 禁止。PR のみ。
  └─ develop      ← 統合ブランチ（任意）
       ├─ feature/xxx   ← 新機能
       ├─ fix/xxx       ← バグ修正
       ├─ chore/xxx     ← 依存更新・設定変更
       └─ docs/xxx      ← ドキュメントのみの変更
```

#### ブランチ命名

| プレフィックス | 用途 | 例 |
|---|---|---|
| `feature/` | 新機能 | `feature/ocr-v2-pipeline` |
| `fix/` | バグ修正 | `fix/staging-duplicate-check` |
| `chore/` | 保守作業 | `chore/update-gemini-sdk` |
| `docs/` | ドキュメント | `docs/ocr-design-v2` |
| `release/` | リリース準備 | `release/v1.2.0` |

### コミットメッセージ規則（Conventional Commits）

```
<type>(<scope>): <subject>

[optional body]
```

| type | 用途 |
|------|------|
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `chore` | ビルド・依存・設定変更 |
| `docs` | ドキュメントのみ |
| `refactor` | 動作を変えないリファクタリング |
| `test` | テストの追加・修正 |
| `perf` | パフォーマンス改善 |
| `style` | フォーマット修正（ロジック変更なし） |

```bash
# 良い例
feat(ocr): Gemini 2.5 Flash + TCGdex 2段階パイプライン実装
fix(staging): OCR ステータス未設定時のデフォルト値を修正
chore(deps): @google-cloud/vertexai を 1.10.4 に更新
docs: OCR v2 設計書・実装指示書を追加

# NG（情報が薄い）
update files
fix bug
wip
```

### PR ルール

1. **タイトル** はコミットメッセージと同じ形式
2. **本文** に変更内容・テスト方法・スクリーンショット（UI 変更時）を記載
3. セルフレビュー後にマージ（1 名体制の場合は squash merge 推奨）
4. DB マイグレーションを含む PR は `down.sql` も必ず同梱

### コード品質

```bash
# TypeScript 型チェック（CI でも実行）
cd app/web && npx tsc --noEmit

# Lint
cd app/web && npm run lint
```

---

## バージョン管理

[Semantic Versioning](https://semver.org/lang/ja/) を採用。

```
v<MAJOR>.<MINOR>.<PATCH>

MAJOR: 後方非互換な変更（DB スキーマ破壊的変更、API 仕様変更）
MINOR: 後方互換な新機能追加
PATCH: バグ修正・小改善
```

### リリースフロー

```bash
# 1. release ブランチを作成
git checkout -b release/v1.2.0

# 2. バージョン確認・changelog 更新
# package.json の version を更新（任意）

# 3. main にマージ（PR 経由）

# 4. タグを打つ
git tag -a v1.2.0 -m "v1.2.0: OCR v2 パイプライン本番化"
git push origin v1.2.0
```

---

## 設計ドキュメント

| ドキュメント | 説明 |
|---|---|
| [`docs/ocr-v2-design.md`](docs/ocr-v2-design.md) | OCR v2 設計書（ポケカ底部ストリップ解析、コスト試算） |
| [`docs/ocr-v2-implementation-guide.md`](docs/ocr-v2-implementation-guide.md) | OCR v2 実装指示書（Phase A〜D） |

---

## ライセンス

Private repository. All rights reserved.
