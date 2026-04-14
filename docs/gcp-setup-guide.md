# GCP セットアップガイド

作成日: 2026-04-14  
対象環境: Google Cloud Platform（本番・ステージング共通）

---

## 概要

Poketre が使用する GCP サービスと、その初期設定手順を示す。

| サービス | 用途 |
|---|---|
| Cloud Storage (GCS) | スキャン画像の保存 |
| Vertex AI (Gemini) | カード OCR（画像解析） |
| Cloud Tasks | 非同期 OCR キュー |
| Cloud SQL (省略可) | PostgreSQL（Docker Compose でも代替可） |
| Secret Manager (推奨) | 環境変数の安全管理 |

---

## 前提条件

```bash
# Google Cloud SDK インストール済みであること
gcloud --version

# 認証（ローカル開発用）
gcloud auth login
gcloud auth application-default login

# 対象プロジェクトを設定
export PROJECT_ID="your-project-id"
gcloud config set project $PROJECT_ID
```

---

## 1. プロジェクト準備

```bash
# 必要な API を有効化（まとめて実行）
gcloud services enable \
  storage.googleapis.com \
  aiplatform.googleapis.com \
  cloudtasks.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com
```

---

## 2. Cloud Storage（GCS）

### バケット作成

```bash
export BUCKET_NAME="${PROJECT_ID}-poketre-ocr"
export REGION="asia-northeast1"   # 東京

gcloud storage buckets create "gs://${BUCKET_NAME}" \
  --location="${REGION}" \
  --uniform-bucket-level-access \
  --public-access-prevention
```

### バケットポリシー（アプリからのアクセスのみ許可）

```bash
# バケット名を .env.local に記録
echo "GCS_BUCKET=${BUCKET_NAME}"
```

> **注意**: バケットは非公開設定。画像 URL は `https://storage.googleapis.com/` の署名付き URL か、
> サービスアカウントを通じたアクセスのみ許可する。

---

## 3. サービスアカウント作成

アプリケーション用のサービスアカウントを1つ作成し、必要な権限を付与する。

```bash
export SA_NAME="poketre-app"
export SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# サービスアカウント作成
gcloud iam service-accounts create ${SA_NAME} \
  --display-name="Poketre Application"

# 必要なロールを付与
# GCS への読み書き
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin" \
  --condition="expression=resource.name.startsWith('projects/_/buckets/${BUCKET_NAME}'),title=poketre-bucket-only"

# Vertex AI（Gemini）の呼び出し
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/aiplatform.user"

# Cloud Tasks へのタスク作成
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudtasks.enqueuer"
```

### サービスアカウントキーの取得

#### ローカル開発の場合（推奨: Application Default Credentials）

```bash
# gcloud ログインで代替（キーファイル不要）
gcloud auth application-default login
# → ~/.config/gcloud/application_default_credentials.json に保存される
```

#### Vercel / 外部ホスト の場合（JSON キー）

```bash
# キーファイルを生成（コミットしないこと！）
gcloud iam service-accounts keys create ./gcp-key.json \
  --iam-account=${SA_EMAIL}

# 1行 JSON に変換して環境変数へ
cat gcp-key.json | jq -c . 
# → Vercel の GCP_SERVICE_ACCOUNT_JSON にそのまま貼り付け
```

---

## 4. Vertex AI（Gemini 2.5 Flash）

Vertex AI はプロジェクト ID とリージョンがあれば、追加設定不要で使用できる。

```bash
# 使用リージョン確認（Gemini 対応リージョン）
# asia-northeast1（東京）は Gemini 2.5 Flash に対応済み

echo "GOOGLE_CLOUD_PROJECT=${PROJECT_ID}"
echo "VERTEX_AI_LOCATION=asia-northeast1"
echo "GEMINI_MODEL=gemini-2.5-flash"
```

> **モデルについて**: `gemini-2.5-flash` はマルチモーダル対応の最新 Flash モデル。
> ポケカの底部ストリップ（規制マーク・セットコード・カード番号・レアリティ）を
> 高精度で読み取る。

---

## 5. Cloud Tasks

### キューの作成

```bash
export QUEUE_NAME="poketre-ocr-queue"
export TASKS_REGION="asia-northeast1"

gcloud tasks queues create ${QUEUE_NAME} \
  --location=${TASKS_REGION} \
  --max-concurrent-dispatches=10 \
  --max-attempts=3 \
  --min-backoff=10s \
  --max-backoff=300s \
  --max-doublings=3
```

### キュー設定の説明

| パラメータ | 値 | 意味 |
|---|---|---|
| `max-concurrent-dispatches` | 10 | 同時実行タスク数（Gemini レートに合わせる） |
| `max-attempts` | 3 | 最大リトライ回数 |
| `min-backoff` | 10s | 初回リトライまでの待機 |
| `max-backoff` | 300s | 最大待機時間（指数バックオフ） |

### ワーカー URL の設定

```bash
# アプリの OCR ワーカーエンドポイント
# 本番 URL に置き換えること
export WORKER_URL="https://your-app.vercel.app/api/ocr/process-job"

echo "CLOUD_TASKS_LOCATION=${TASKS_REGION}"
echo "CLOUD_TASKS_QUEUE=${QUEUE_NAME}"
echo "CLOUD_TASKS_WORKER_URL=${WORKER_URL}"
```

### OIDC 認証（Cloud Tasks → ワーカー）

Cloud Tasks から Next.js API を叩くとき、OIDC トークンで認証する場合：

```bash
# Cloud Tasks がワーカーを呼び出す際に使うサービスアカウント（上記と同じでよい）
echo "CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL=${SA_EMAIL}"
```

または、シンプルな共有シークレット方式（推奨）：

```bash
# ランダムな秘密キーを生成
export WORKER_SECRET=$(openssl rand -hex 32)
echo "OCR_WORKER_SHARED_SECRET=${WORKER_SECRET}"
# → アプリとCloud Tasksの両方に同じ値を設定
```

---

## 6. PostgreSQL（Cloud SQL）

> **ローカル開発**: `docker compose up -d postgres` で代替可能。  
> **本番**: Cloud SQL または Supabase を推奨。

### Cloud SQL インスタンス作成（本番用）

```bash
export DB_INSTANCE="poketre-db"
export DB_REGION="asia-northeast1"

# PostgreSQL 16 インスタンス作成（最小構成）
gcloud sql instances create ${DB_INSTANCE} \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=${DB_REGION} \
  --storage-type=SSD \
  --storage-size=10GB \
  --backup-start-time=02:00 \
  --deletion-protection

# データベース作成
gcloud sql databases create poketre --instance=${DB_INSTANCE}

# ユーザー作成
gcloud sql users create poketre \
  --instance=${DB_INSTANCE} \
  --password="$(openssl rand -hex 16)"
```

### 接続文字列

```bash
# Cloud SQL Proxy 経由（ローカルから本番DBへ接続する場合）
./cloud-sql-proxy ${PROJECT_ID}:${DB_REGION}:${DB_INSTANCE} &
export DATABASE_URL="postgresql://poketre:PASSWORD@localhost:5432/poketre"

# Vercel / Cloud Run から直接接続する場合（Unix Socket）
export DATABASE_URL="postgresql://poketre:PASSWORD@/poketre?host=/cloudsql/${PROJECT_ID}:${DB_REGION}:${DB_INSTANCE}"
```

---

## 7. 環境変数まとめ

以下を `.env.local` に設定する（`.env.local` は `.gitignore` に含まれており、コミットされない）。

```bash
# ─── GCP 基本 ──────────────────────────────────────────────────────
GOOGLE_CLOUD_PROJECT=your-project-id

# ─── GCS ───────────────────────────────────────────────────────────
GCS_BUCKET=your-project-id-poketre-ocr

# ─── Vertex AI / Gemini ────────────────────────────────────────────
VERTEX_AI_LOCATION=asia-northeast1
GEMINI_MODEL=gemini-2.5-flash

# ─── Cloud Tasks ───────────────────────────────────────────────────
CLOUD_TASKS_LOCATION=asia-northeast1
CLOUD_TASKS_QUEUE=poketre-ocr-queue
CLOUD_TASKS_WORKER_URL=https://your-app.vercel.app/api/ocr/process-job
CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL=poketre-app@your-project-id.iam.gserviceaccount.com

# ─── OCR ワーカー認証 ──────────────────────────────────────────────
OCR_WORKER_SHARED_SECRET=（openssl rand -hex 32 で生成）

# ─── PostgreSQL ────────────────────────────────────────────────────
DATABASE_URL=postgresql://poketre:PASSWORD@localhost:5432/poketre

# ─── Supabase（認証用・省略可）────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# ─── GCP サービスアカウント（Vercel 等のホスト用）────────────────
# gcloud iam service-accounts keys create で取得した JSON を1行に
# GCP_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

---

## 8. ローカル開発の認証設定

ローカルでは JSON キーファイルを使わず、ADC（Application Default Credentials）を推奨。

```bash
# 1. gcloud でログイン
gcloud auth application-default login

# 2. プロジェクトを設定
gcloud config set project your-project-id

# 3. .env.local に最低限の設定を追加
GOOGLE_CLOUD_PROJECT=your-project-id
GCS_BUCKET=your-project-id-poketre-ocr
VERTEX_AI_LOCATION=asia-northeast1

# 4. Docker で PostgreSQL 起動
docker compose up -d postgres

# 5. DB マイグレーション
cd app/web && npm run db:migrate

# 6. 開発サーバー起動
npm run dev
```

> **Cloud Tasks ローカルテスト**: Cloud Tasks はクラウド上からしか呼び出せないため、
> ローカルでは OCR を直接呼び出す手動テストを推奨。
> `curl -X POST http://localhost:3000/api/ocr/process-job -H "Content-Type: application/json" -d '{"job_id":"xxx"}'`

---

## 9. Vercel へのデプロイ

```bash
# Vercel CLI でプロジェクトをリンク
vercel link

# 環境変数を一括設定（本番）
vercel env add GOOGLE_CLOUD_PROJECT production
vercel env add GCS_BUCKET production
vercel env add VERTEX_AI_LOCATION production
vercel env add GEMINI_MODEL production
vercel env add CLOUD_TASKS_LOCATION production
vercel env add CLOUD_TASKS_QUEUE production
vercel env add CLOUD_TASKS_WORKER_URL production
vercel env add CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL production
vercel env add OCR_WORKER_SHARED_SECRET production
vercel env add DATABASE_URL production
vercel env add GCP_SERVICE_ACCOUNT_JSON production  # SA の JSON（1行）

# デプロイ
vercel --prod
```

---

## 10. 動作確認チェックリスト

### GCS
- [ ] バケットが存在する: `gcloud storage ls gs://${BUCKET_NAME}`
- [ ] サービスアカウントから書き込みできる

### Vertex AI
- [ ] Gemini 2.5 Flash が呼び出せる（Vertex AI コンソール → Model Garden で確認）
- [ ] `asia-northeast1` リージョンで有効

### Cloud Tasks
- [ ] キューが存在する: `gcloud tasks queues describe ${QUEUE_NAME} --location=${TASKS_REGION}`
- [ ] ワーカー URL が公開アクセス可能
- [ ] `OCR_WORKER_SHARED_SECRET` がアプリとキューで一致

### DB
- [ ] `DATABASE_URL` で接続できる
- [ ] マイグレーション適用済み: `npm run db:migrate`
- [ ] `ocr_jobs` テーブルに `file_name`, `input_location_code`, `stg_id` カラムがある

---

## コスト目安

| サービス | 月額目安 | 備考 |
|---|---|---|
| GCS | ～$0.05 | 10,000枚 × 500KB = 5GB |
| Gemini 2.5 Flash | ～$2.50 | 10,000枚 × $0.00025/枚 |
| Cloud Tasks | 無料 | 月100万タスクまで無料 |
| Cloud SQL (db-f1-micro) | ～$10 | 最小構成。Supabase Free で代替可 |
| **合計** | **～$13/月** | 10,000枚/月の場合 |

> Supabase Free プランを使えば Cloud SQL コストを $0 にできる。
