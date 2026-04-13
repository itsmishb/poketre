# OCR パイプライン v2 設計書

作成日: 2026-04-13  
対象バージョン: Next.js Web App（Poketre）

---

## 1. 背景・目的

### 1.1 現状の課題

| 課題 | 内容 |
|------|------|
| 同期処理タイムアウト | OCR を HTTP リクエスト内で実行するため、ファイル数が増えると確実にタイムアウト |
| バッチ上限 | MAX 100 枚。500 枚対応が必要 |
| 逐次処理 | 1 バッチ完了まで次のアップロードを待つ必要がある |
| モデル精度 | gemini-2.0-flash-001 → 2.5 Flash へ精度向上 |
| Drive 依存残留 | `ocr_staging.drive_file_id` が NOT NULL のまま |
| データ補完なし | Gemini 結果のみで、公式データベースとの照合なし |

### 1.2 目的

- アップロードと OCR 処理を**完全分離**し、500 枚 × 複数バッチを待ち時間なく受け付ける
- **Gemini 2.5 Flash + TCGdex 補完**により認識精度を最大化
- Cloud Tasks（既存インフラ）を活用し、追加インフラコストを最小化
- フロントエンドにリアルタイムな進捗フィードバックを提供

---

## 2. ポケモンカード構造の理解（OCR 設計根拠）

### 2.1 識別に使うフィールドの配置

スカーレット＆バイオレット以降のカードは、左下に 4 フィールドが並ぶ「識別ストリップ」を持つ。

```
┌───────────────────────────────────────┐
│                カード本体               │
│                                       │
│  ┌──────┬────────┬──────────┬──────┐  │
│  │ [G]  │ [SV4a] │[001/165] │ [C]  │  │
│  │ 規制 │セット  │カード番号 │レアリ│  │
│  │マーク│コード  │          │ティ  │  │
│  └──────┴────────┴──────────┴──────┘  │
│   青枠   紫枠      緑枠      赤枠      │
└───────────────────────────────────────┘
```

**重要**: この 4 フィールドはすべて **ASCII/英数字** のみで構成される。

### 2.2 フィールド別フォーマット

| フィールド | フォーマット | 正規表現 | OCR 難易度 |
|-----------|-------------|---------|-----------|
| 規制マーク | 1文字 `A`〜`I` | `[A-I]` | 低 |
| セットコード | `SV` + 数字 + 任意1文字 | `SV\d+[a-z]?` | 低 |
| カード番号 | `NNN/NNN`（3桁ゼロ埋め） | `\d{3}/\d{3}` | 低 |
| レアリティ | 1〜3文字の大文字 | `C\|U\|R\|RR\|AR\|SR\|SAR\|UR\|ACE` | 低〜中 |
| **カード名** | カタカナ/漢字・装飾フォント | — | **中〜高** |

### 2.3 OCR 難易度の整理

```
セットコード + カード番号 = 完全一意識別
  → この 2 フィールドさえ取れれば TCGdex で全情報を補完できる

カード名 = 装飾フォント・ホイル干渉で誤認識しやすい
  → Gemini が認識 → TCGdex データで検証・上書き

レアリティ = 短いが SR/SAR/UR の判別が難しい場合がある
  → TCGdex でカード番号から確定できる（シークレットレアは番号が定数超過）
```

### 2.4 レアリティ体系（スカーレット＆バイオレット期）

| コード | 名称 | 特徴 |
|--------|------|------|
| C | コモン | 進化前ポケモン |
| U | アンコモン | 進化ポケモン・トレーナーズ |
| R | レア | ホイル仕上げ |
| RR | ダブルレア | ポケモン ex |
| AR | アートレア | 全面アートワーク |
| SR | スーパーレア | ex テクスチャー仕上げ |
| SAR | スペシャルアートレア | グリッターホイル |
| UR | ウルトラレア | 全面ゴールドホイル |
| ACE | エーススペック | 強力トレーナーズ・エネルギー |

**シークレットレア判定**: カード番号の分子 > 分母（例: `201/190` → SR以上）

---

## 3. システムアーキテクチャ

### 3.1 全体フロー

```
【アップロードフェーズ】 ─ 即時レスポンス（1〜3秒）
┌─────────────────────────────────────────────────────┐
│  POST /api/staging/import                           │
│    1. 認証・権限確認（operator / admin）             │
│    2. ファイル検証（≤500枚、≤5MB/枚）                │
│    3. GCS へ画像保存                                 │
│    4. ocr_jobs レコード作成（status: QUEUED）         │
│    5. Cloud Tasks にジョブをエンキュー（1枚=1タスク）  │
│    6. → 即座に { batch_id, count } を返却             │
└─────────────────────────────────────────────────────┘
           ↓ Cloud Tasks（非同期・並列）
【OCR処理フェーズ】 ─ バックグラウンド
┌─────────────────────────────────────────────────────┐
│  POST /api/ocr/process-job?job_id=xxx               │
│    1. ocr_jobs を RUNNING に更新                     │
│    2. GCS から画像を取得                              │
│    3. Gemini 2.5 Flash で底部ストリップ解析           │
│       → set_code + card_number_text を最優先抽出     │
│    4. confidence ≥ 0.7 かつ識別フィールドあり:        │
│       → TCGdex API ルックアップ                       │
│       → Gemini 結果を正式データで上書き               │
│    5. 重複候補チェック（serial_number 照合）          │
│    6. ocr_staging INSERT（status: 登録待ち）          │
│    7. ocr_jobs を SUCCEEDED / FAILED に更新           │
└─────────────────────────────────────────────────────┘
           ↓ ポーリング（5秒間隔）
【確認フェーズ】 ─ ユーザー操作
┌─────────────────────────────────────────────────────┐
│  /staging 一覧                                      │
│    - 処理中バッジ「OCR処理中 N/M件」自動更新         │
│    - 完了したカードから順次表示                       │
│                                                     │
│  /staging/[id] 詳細                                 │
│    - Gemini 抽出結果 + TCGdex 補完データを表示       │
│    - OK / NG / 要再スキャン を選択                   │
│    → approve: 在庫へ反映（UNIT / LOT）               │
└─────────────────────────────────────────────────────┘
```

### 3.2 並列処理設計

```
バッチA (500枚) ─→ Cloud Tasks Queue ─→ ワーカー × N 並列
バッチB (300枚) ─→ Cloud Tasks Queue ─→ ワーカー × N 並列
バッチC (200枚) ─→ Cloud Tasks Queue ─→ ...
                        ↑
                ユーザーはすぐ次のバッチを投げられる
```

**Cloud Tasks 並列数設定**（推奨）:
- `maxConcurrentDispatches: 10`（Gemini レート制限に合わせ調整）
- リトライ: 最大 3 回、バックオフ: 10s / 30s / 90s

---

## 4. OCR 戦略詳細

### 4.1 2 段階処理

```
Stage 1: Gemini 2.5 Flash（画像 → 構造化 JSON）
  入力: 画像全体（底部ストリップを意識したプロンプト）
  出力: { set_code, card_number_text, regulation_mark,
          name_ja, rarity, card_type, hp, confidence }

Stage 2: TCGdex API ルックアップ（JSON → 検証・補完）
  条件: confidence ≥ 0.7 かつ (set_code + card_number_text) が取れた場合
  エンドポイント: https://api.tcgdex.net/v2/ja/cards/{setCode}/{cardNumber}
  補完: name_ja, rarity, card_type, hp, regulation_mark
  戦略: TCGdex の値を正とする（Gemini は識別用、TCGdex は確認用）
```

### 4.2 フォールバックロジック

```
Gemini 結果
  ├─ confidence ≥ 0.7 かつ set_code + card_number_text あり
  │   └─ TCGdex ルックアップ
  │       ├─ ヒット → TCGdex データで補完（高信頼）
  │       └─ ミス   → Gemini データのみ使用（要人手確認）
  │
  ├─ confidence < 0.7 または識別フィールドなし
  │   └─ Gemini データのみで ocr_staging 登録（低信頼フラグ）
  │
  └─ Gemini API エラー（5xx / タイムアウト）
      └─ ocr_status = FAILED、Cloud Tasks がリトライ
```

### 4.3 Gemini プロンプト指針（v2）

現行プロンプトに以下を追加:
- 底部ストリップの 4 フィールドを最優先抽出
- セットコードの正規表現パターンを明示（`SV\d+[a-z]?`）
- カード番号のゼロ埋め 3 桁フォーマットを明示（`001/165`）
- レアリティのホワイトリストを提示（C/U/R/RR/AR/SR/SAR/UR/ACE）
- シークレットレアの判定条件（番号 > 総数）を記述

---

## 5. API エンドポイント仕様

### 5.1 POST /api/staging/import

**変更点**: OCR 同期処理を廃止 → Cloud Tasks エンキューのみ

```typescript
// Request: multipart/form-data
{
  input_location_code: string  // "1-2-3"
  files: File[]                // 最大 500 枚、各 5MB 以下
}

// Response 200
{
  ok: true,
  batch_id: string,            // "batch_m6abc123"
  count: number,               // エンキューしたジョブ数
  estimated_minutes: number    // 推定完了時間（件数 × 5秒 / 並列数）
}

// Response 4xx
{ message: string }
```

**処理手順**:
1. `requireOperatorOrAdminUser()` — 認証・権限確認
2. `parseLocationCode()` — 保管場所コード検証
3. ファイル数・サイズチェック
4. GCS へ全ファイルをアップロード
5. `createQueuedOcrJobs()` — `ocr_jobs` に一括 INSERT
6. Cloud Tasks に 1 ジョブ = 1 タスクでエンキュー
7. 即時レスポンス返却

---

### 5.2 POST /api/ocr/process-job（新規）

Cloud Tasks から呼ばれる内部ワーカーエンドポイント。

```typescript
// Request: application/json（Cloud Tasks が送信）
{
  job_id: string
}

// Headers
X-OCR-Secret: <shared_secret>  // 任意・推奨

// Response 200
{ ok: true, stg_id: string }

// Response 4xx/5xx → Cloud Tasks がリトライ
{ error: string }
```

**処理手順**:
1. `X-OCR-Secret` 検証（設定時）
2. `ocr_jobs` を `RUNNING` に更新、`attempt_count++`
3. GCS から画像を取得
4. `extractCardFromImage()` — Gemini 2.5 Flash OCR
5. `lookupByCardNumber()` — TCGdex API（条件付き）
6. `checkDuplicate()` — `cards` テーブルと serial_number 照合
7. `ocr_staging` に INSERT
8. `ocr_jobs` を `SUCCEEDED` / `FAILED` に更新
9. 失敗時: `last_error` を記録、3xx 以外の HTTP エラーで Cloud Tasks がリトライ

---

### 5.3 GET /api/staging/batch-status（新規）

フロントエンドのポーリング用。

```typescript
// Query
?batch_id=batch_m6abc123
// または
?batch_ids=batch_xxx,batch_yyy  // 複数バッチ対応

// Response
{
  batches: [{
    batch_id: string,
    total: number,
    queued: number,
    running: number,
    succeeded: number,
    failed: number,
    completed: boolean
  }]
}
```

---

### 5.4 既存エンドポイント（変更なし）

| エンドポイント | 変更 |
|--------------|------|
| `POST /api/staging/[id]/approve` | なし |
| `POST /api/staging/[id]/reject` | なし |

---

## 6. データベース設計

### 6.1 変更が必要なテーブル

#### ocr_jobs（カラム追加）

```sql
-- マイグレーション: 000006_ocr_jobs_v2.up.sql
ALTER TABLE ocr_jobs
  ADD COLUMN file_name         text,           -- 元ファイル名
  ADD COLUMN input_location_code text,         -- 保管場所コード（ワーカーが参照）
  ADD COLUMN stg_id            text REFERENCES ocr_staging(stg_id);
  -- 処理完了後に ocr_staging との紐づけを格納
```

#### ocr_staging（制約変更・カラム追加）

```sql
-- drive_file_id の NOT NULL を解除（Google Drive 依存からの移行）
ALTER TABLE ocr_staging
  ALTER COLUMN drive_file_id DROP NOT NULL;

-- TCGdex 関連カラム追加
ALTER TABLE ocr_staging
  ADD COLUMN tcgdex_id    text,           -- TCGdex のカード ID
  ADD COLUMN ocr_engine   text DEFAULT 'gemini-2.5-flash',
  ADD COLUMN data_source  text DEFAULT 'gemini'
    CHECK (data_source IN ('gemini', 'tcgdex', 'gemini+tcgdex', 'manual'));

-- source の CHECK 制約に MANUAL を追加
ALTER TABLE ocr_staging
  DROP CONSTRAINT ocr_staging_source_check;
ALTER TABLE ocr_staging
  ADD CONSTRAINT ocr_staging_source_check
  CHECK (source IN ('PIPELINE', 'WEB_UPLOAD', 'MANUAL'));
```

### 6.2 テーブル関係図（OCR 関連）

```
ocr_jobs
  │ job_id (PK, uuid)
  │ batch_id
  │ gcs_bucket / gcs_object_path
  │ file_name                    ← 追加
  │ input_location_code          ← 追加
  │ stg_id → ocr_staging         ← 追加
  │ status: QUEUED/RUNNING/SUCCEEDED/FAILED/RETRY
  │ attempt_count / next_run_at
  │ created_by → app_users
  └─────────────────────────────
          ↓ 1:1
ocr_staging
  │ stg_id (PK, text)
  │ ocr_job_id → ocr_jobs        ← 双方向参照
  │ drive_file_id (nullable)     ← NOT NULL 解除
  │ file_name / image_url
  │ batch_id / source / input_location_code
  │
  │ [OCR 結果]
  │ serial_number                -- set_code + "_" + card_number_text
  │ set_code                     -- SV4a, SV8 など
  │ card_number_text             -- 001/165
  │ card_number / number_total   -- 数値分解
  │ regulation_mark              -- G, H, I など
  │ name_ja                      -- カード名（日本語）
  │ rarity                       -- C, U, R, RR, SR, SAR, UR, ACE
  │ card_type                    -- ポケモン/トレーナーズ/エネルギー
  │ hp                           -- ポケモンのHP
  │ poke_type / trainer_subtype
  │ holo / mirror_pattern
  │ illustrator
  │ confidence                   -- 0〜1
  │ tcgdex_id                    ← 追加
  │ ocr_engine                   ← 追加
  │ data_source                  ← 追加
  │
  │ [ワークフロー]
  │ status: 登録待ち/確定/NG 等
  │ review_status: PENDING/APPROVED/REJECTED/NEEDS_RESCAN
  │ ocr_status: PENDING/RUNNING/SUCCEEDED/FAILED
  │ duplicate_status: NONE/CANDIDATE/RESOLVED
  │ duplicate_card_id → cards
  │ merge_decision: MERGE_EXISTING/CREATE_NEW
  │
  └── approved_at, reviewer_id → app_users
               ↓ approve
  ┌────────────────────────────┐
  │ inventory_units (type=UNIT)│
  │ inventory_lots  (type=LOT) │
  │   → card_id → cards        │
  │   → storage_location_id    │
  └────────────────────────────┘
```

### 6.3 完全テーブル定義（変更後）

#### ocr_jobs（完全版）

```sql
CREATE TABLE ocr_jobs (
  job_id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id            text        NOT NULL,
  source              text        NOT NULL DEFAULT 'WEB_UPLOAD',
  gcs_bucket          text        NOT NULL,
  gcs_object_path     text        NOT NULL,
  file_name           text,                           -- ← 追加
  input_location_code text,                           -- ← 追加
  stg_id              text        REFERENCES ocr_staging(stg_id),  -- ← 追加
  status              text        NOT NULL DEFAULT 'QUEUED'
                                  CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','RETRY')),
  attempt_count       integer     NOT NULL DEFAULT 0,
  next_run_at         timestamptz NOT NULL DEFAULT now(),
  last_error          text,
  created_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ocr_jobs_status_next  ON ocr_jobs (status, next_run_at);
CREATE INDEX idx_ocr_jobs_batch        ON ocr_jobs (batch_id, created_at);
```

#### ocr_staging（変更点のみ記載）

```sql
-- 既存テーブルから変更・追加される列
drive_file_id   text        UNIQUE,          -- NOT NULL を解除
tcgdex_id       text,                        -- 追加
ocr_engine      text        DEFAULT 'gemini-2.5-flash',  -- 追加
data_source     text        DEFAULT 'gemini'             -- 追加
                            CHECK (data_source IN ('gemini','tcgdex','gemini+tcgdex','manual')),
```

### 6.4 マイグレーションファイル

```
db/migrations/
  000006_ocr_jobs_v2.up.sql      ← 今回追加
  000006_ocr_jobs_v2.down.sql    ← ロールバック用
```

**000006_ocr_jobs_v2.up.sql**:
```sql
-- ocr_jobs にカラム追加
ALTER TABLE ocr_jobs
  ADD COLUMN file_name           text,
  ADD COLUMN input_location_code text,
  ADD COLUMN stg_id              text REFERENCES ocr_staging(stg_id);

-- ocr_staging: drive_file_id の NOT NULL 解除
ALTER TABLE ocr_staging
  ALTER COLUMN drive_file_id DROP NOT NULL;

-- ocr_staging: 新カラム追加
ALTER TABLE ocr_staging
  ADD COLUMN tcgdex_id   text,
  ADD COLUMN ocr_engine  text DEFAULT 'gemini-2.5-flash',
  ADD COLUMN data_source text DEFAULT 'gemini'
    CHECK (data_source IN ('gemini', 'tcgdex', 'gemini+tcgdex', 'manual'));

-- source CHECK 制約を更新（MANUAL 追加）
ALTER TABLE ocr_staging
  DROP CONSTRAINT IF EXISTS ocr_staging_source_check;
ALTER TABLE ocr_staging
  ADD CONSTRAINT ocr_staging_source_check
  CHECK (source IN ('PIPELINE', 'WEB_UPLOAD', 'MANUAL'));
```

**000006_ocr_jobs_v2.down.sql**:
```sql
ALTER TABLE ocr_jobs
  DROP COLUMN IF EXISTS file_name,
  DROP COLUMN IF EXISTS input_location_code,
  DROP COLUMN IF EXISTS stg_id;

ALTER TABLE ocr_staging
  ALTER COLUMN drive_file_id SET NOT NULL;

ALTER TABLE ocr_staging
  DROP COLUMN IF EXISTS tcgdex_id,
  DROP COLUMN IF EXISTS ocr_engine,
  DROP COLUMN IF EXISTS data_source;

ALTER TABLE ocr_staging
  DROP CONSTRAINT IF EXISTS ocr_staging_source_check;
ALTER TABLE ocr_staging
  ADD CONSTRAINT ocr_staging_source_check
  CHECK (source IN ('PIPELINE', 'WEB_UPLOAD'));
```

---

## 7. ライブラリ構成（lib/ocr/）

```
app/web/lib/ocr/
  schema.ts         -- OcrCardResult 型定義（regulation_mark, hp, data_source 追加）
  prompt.ts         -- Gemini プロンプト（v2: 底部ストリップ強化）
  gemini.ts         -- Gemini 2.5 Flash 呼び出し
  tcgdex.ts         -- TCGdex API ルックアップ（新規）
  normalize.ts      -- set_code/rarity の正規化・バリデーション（新規）
  pipeline.ts       -- Gemini + TCGdex の 2 段階処理オーケストレーター（新規）
```

### 型定義（schema.ts v2）

```typescript
export type OcrCardResult = {
  // 識別フィールド（優先度: 高）
  serial_number:     string | null;   // "SV4a_001/165"
  set_code:          string | null;   // "SV4a"
  card_number_text:  string | null;   // "001/165"
  regulation_mark:   string | null;   // "G"

  // カード情報
  name_ja:           string | null;   // "ピカチュウ"
  rarity:            string | null;   // "C", "SR", "SAR" など
  card_type:         string | null;   // "ポケモン" / "トレーナーズ" / "エネルギー"
  hp:                number | null;   // 230（ポケモンのみ）

  // メタ情報
  confidence:        number;          // 0〜1（Gemini の自己評価）
  data_source:       "gemini" | "tcgdex" | "gemini+tcgdex";
  tcgdex_id:         string | null;   // TCGdex のカード ID
};
```

### TCGdex API（tcgdex.ts）

```typescript
const TCGDEX_BASE = "https://api.tcgdex.net/v2/ja";

export async function lookupByCardNumber(
  setCode: string,
  cardNumberText: string    // "001/165" → cardNumber = "1"
): Promise<Partial<OcrCardResult> | null>
```

レスポンス例:
```json
{
  "id": "sv4a-1",
  "localId": "1",
  "name": "ピカチュウ",
  "hp": 60,
  "rarity": "Common",
  "category": "Pokemon",
  "regulationMark": "H"
}
```

---

## 8. フロントエンド変更

### 8.1 /staging/import（取り込みページ）

変更点:
- アップロード完了後に `batch_id` を localStorage に保存
- 「処理中バッチを確認」リンクを表示
- 上限表示を 100 → **500 枚**に変更

### 8.2 /staging（一覧ページ）

変更点:
- ページ読み込み時に処理中バッチがあればポーリング開始
- `GET /api/staging/batch-status?batch_ids=xxx` を 5 秒ごとに呼び出し
- 全ジョブ完了でポーリング停止
- 処理中バッジ: 「OCR 処理中 N/M 件」

```
┌──────────────────────────────────────────────┐
│ 登録待ち一覧             3件  [一括取り込み] │
│ OCR処理中: 12/47件 ████████░░░░ 26%          │ ← ポーリングで更新
├──────────────────────────────────────────────┤
│ [画像] カイリューex  SV2 · 050/078 · 二レア  │
│        1     完了   なし          [確認]     │
...
```

### 8.3 ポーリング実装方針

```typescript
// Client Component（staging/page.tsx に追加）
"use client"
useEffect(() => {
  if (!pendingBatchIds.length) return;
  const interval = setInterval(async () => {
    const status = await fetchBatchStatus(pendingBatchIds);
    if (status.allCompleted) {
      clearInterval(interval);
      router.refresh();  // Server Component を再フェッチ
    }
    setProgress(status);
  }, 5000);
  return () => clearInterval(interval);
}, [pendingBatchIds]);
```

---

## 9. 環境変数

### Web（Next.js）側

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 接続文字列 |
| `GOOGLE_CLOUD_PROJECT` | ✅ | GCP プロジェクト ID |
| `GCS_BUCKET` | ✅ | 画像アップロード先バケット名 |
| `VERTEX_AI_LOCATION` | — | デフォルト: `asia-northeast1` |
| `GEMINI_MODEL` | — | デフォルト: `gemini-2.5-flash-preview-04-17` |
| `CLOUD_TASKS_LOCATION` | ✅ | 例: `asia-northeast1` |
| `CLOUD_TASKS_QUEUE` | ✅ | キュー名 |
| `CLOUD_TASKS_WORKER_URL` | ✅ | `https://your-app.com/api/ocr/process-job` |
| `CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL` | — | OIDC 認証用 SA |
| `OCR_WORKER_SHARED_SECRET` | 推奨 | ワーカー認証用シークレット |
| `TCGDEX_API_BASE` | — | デフォルト: `https://api.tcgdex.net/v2/ja` |

### 認証

| 環境 | 方式 |
|------|------|
| ローカル開発 | `gcloud auth application-default login` |
| 本番（Cloud Run / Vercel） | サービスアカウント JSON（Secret Manager 経由） |

---

## 10. コスト見積もり

### 月間 10,000 枚処理の場合

| サービス | 料金 | 月額（10,000枚） |
|---------|------|----------------|
| Gemini 2.5 Flash | $0.0002/枚 | **$2.00** |
| Cloud Storage（GCS） | $0.023/GB（保存）+ $0.12/GB（転送） | **〜$0.50** |
| Cloud Tasks | $0.40/100万タスク | **$0.004**（実質無料） |
| TCGdex API | 無料（オープン API） | **$0** |
| **合計** | | **〜$2.50/月（約375円）** |

### 比較（Vision API 使用の場合）

| サービス | 月額（10,000枚） |
|---------|----------------|
| Vision API TEXT_DETECTION | $15.00 |
| Gemini 2.5 Flash（テキスト解析） | $0.50 |
| **合計** | **$15.50/月** |

→ **Gemini 2.5 Flash 単独の方が 6 倍安く精度も高い**

---

## 11. エラーハンドリング

### Cloud Tasks リトライ設定

```
maxAttempts: 3
minBackoff:  10s
maxBackoff:  300s
maxDoublings: 2
```

### エラー種別と対応

| エラー種別 | ocr_jobs.status | ocr_staging | 対応 |
|-----------|----------------|------------|------|
| Gemini 5xx / タイムアウト | RETRY | — | Cloud Tasks が自動リトライ |
| Gemini JSON パース失敗 | SUCCEEDED | 全フィールド null、confidence=0 | 人手でレビュー |
| TCGdex API 失敗 | SUCCEEDED | Gemini データのみ | 人手でレビュー |
| GCS 取得失敗 | FAILED | — | last_error に記録 |
| 3 回全失敗 | FAILED | — | last_error に記録 |
| 重複検出 | SUCCEEDED | duplicate_status=CANDIDATE | 人手で merge 判断 |

---

## 12. セキュリティ

- `/api/ocr/process-job` は `X-OCR-Secret` または Cloud Tasks OIDC で保護
- `import` / `approve` / `reject` は `requireOperatorOrAdminUser()` で認証必須
- GCS バケットは非公開。`image_url` は署名付き URL または CDN 経由
- `reviewer_id` は常に実認証ユーザー ID（固定値禁止）

---

## 13. 実装ロードマップ

### Phase A: DB マイグレーション（先行）
- `000006_ocr_jobs_v2.up.sql` を適用
- 既存データへの影響: なし（カラム追加・制約変更のみ）

### Phase B: OCR ライブラリ更新
- `lib/ocr/gemini.ts` — モデルを `gemini-2.5-flash-preview-04-17` に変更
- `lib/ocr/prompt.ts` — v2 プロンプト（底部ストリップ特化）
- `lib/ocr/tcgdex.ts` — 新規作成
- `lib/ocr/normalize.ts` — セットコード・レアリティ正規化
- `lib/ocr/pipeline.ts` — 2 段階オーケストレーター

### Phase C: API エンドポイント
- `app/api/staging/import/route.ts` — Cloud Tasks 化（同期 OCR を廃止）
- `app/api/ocr/process-job/route.ts` — 新規ワーカーエンドポイント
- `app/api/staging/batch-status/route.ts` — 新規ポーリング用

### Phase D: フロントエンド
- `staging/import/page.tsx` — 上限 500 枚表示、バッチ ID 保存
- `staging/page.tsx` — ポーリング、処理中プログレスバー

---

## 14. 未解決事項・今後の改善候補

| 項目 | 優先度 | 内容 |
|------|--------|------|
| TCGdex 日本語カードカバレッジ確認 | 高 | SV 全弾のデータがあるか要確認 |
| ホイルカード精度評価 | 高 | SR/SAR/UR の底部ストリップ認識テスト |
| 失敗ジョブの再実行 UI | 中 | 管理画面から手動再キュー |
| GCS 署名付き URL 対応 | 中 | 現在は公開 URL。非公開バケット化 |
| PSA スラブ対応 | 中 | スラブ画像の特殊処理（ラベル読み取り） |
| 重複候補スコアリング強化 | 低 | 名前類似度の導入 |
| OCR 結果と承認値の差分ログ | 低 | 精度改善のためのフィードバックループ |
