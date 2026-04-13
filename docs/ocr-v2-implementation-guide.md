# OCR v2 実装指示書

作成日: 2026-04-14  
設計書: `docs/ocr-v2-design.md`  
前提読書: `docs/ocr-v2-design.md` を必ず先に読むこと

---

## 現状の把握（セッション開始時に確認すること）

```bash
# プロジェクトルート
cd /Users/mishb/Documents/書類\ -\ Mac\ Studio/work/Poketre

# 開発サーバー確認
# Claude Preview の "Next.js Web App" (port 3000) が既に起動済みのはず

# 現在の ocr/ ディレクトリ
ls app/web/lib/ocr/
# → schema.ts, prompt.ts, gemini.ts の 3 ファイルが存在する（v1 実装済み）

# 現在の import route
cat app/web/app/api/staging/import/route.ts
# → 同期 OCR 実装（Cloud Tasks 未使用）。これを置き換える。
```

---

## 実装フェーズ一覧

| Phase | 内容 | 依存 |
|-------|------|------|
| A | DB マイグレーション | なし（最初に実行） |
| B | OCR ライブラリ更新 | A 完了後 |
| C | API エンドポイント更新 | B 完了後 |
| D | フロントエンド更新 | C 完了後 |

---

## Phase A: DB マイグレーション

### 作業内容

ファイルを新規作成する。

**`db/migrations/000006_ocr_jobs_v2.up.sql`**:
```sql
-- ocr_jobs にカラム追加
ALTER TABLE ocr_jobs
  ADD COLUMN IF NOT EXISTS file_name           text,
  ADD COLUMN IF NOT EXISTS input_location_code text,
  ADD COLUMN IF NOT EXISTS stg_id              text REFERENCES ocr_staging(stg_id);

-- ocr_staging: drive_file_id の NOT NULL 解除（Google Drive 依存脱却）
ALTER TABLE ocr_staging
  ALTER COLUMN drive_file_id DROP NOT NULL;

-- ocr_staging: 新カラム追加
ALTER TABLE ocr_staging
  ADD COLUMN IF NOT EXISTS tcgdex_id   text,
  ADD COLUMN IF NOT EXISTS ocr_engine  text DEFAULT 'gemini-2.5-flash',
  ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'gemini'
    CHECK (data_source IN ('gemini', 'tcgdex', 'gemini+tcgdex', 'manual'));

-- source CHECK 制約を更新（MANUAL 追加）
ALTER TABLE ocr_staging
  DROP CONSTRAINT IF EXISTS ocr_staging_source_check;
ALTER TABLE ocr_staging
  ADD CONSTRAINT ocr_staging_source_check
  CHECK (source IN ('PIPELINE', 'WEB_UPLOAD', 'MANUAL'));
```

**`db/migrations/000006_ocr_jobs_v2.down.sql`**:
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

### 適用方法

```bash
# DATABASE_URL が設定されている場合
psql $DATABASE_URL -f db/migrations/000006_ocr_jobs_v2.up.sql

# または既存のマイグレーションツールがあれば確認して使う
# migrate ツールの場所を確認:
ls db/ Makefile
```

### 完了確認

```sql
-- ocr_jobs のカラム確認
SELECT column_name FROM information_schema.columns
WHERE table_name = 'ocr_jobs' ORDER BY ordinal_position;
-- file_name, input_location_code, stg_id が含まれること

-- ocr_staging の drive_file_id nullable 確認
SELECT is_nullable FROM information_schema.columns
WHERE table_name = 'ocr_staging' AND column_name = 'drive_file_id';
-- → YES
```

---

## Phase B: OCR ライブラリ更新

### B-1. schema.ts を更新

**ファイル**: `app/web/lib/ocr/schema.ts`  
**現状**: `OcrCardResult` に `regulation_mark`, `hp`, `data_source`, `tcgdex_id` がない  
**変更**: 以下の型に完全置換する

```typescript
/**
 * OCR 抽出結果スキーマ v2
 * Gemini 2.5 Flash + TCGdex 補完後の最終型
 */
export type OcrCardResult = {
  // 識別フィールド（優先度: 高）
  serial_number:    string | null;  // "SV4a_001/165"
  set_code:         string | null;  // "SV4a"
  card_number_text: string | null;  // "001/165"
  regulation_mark:  string | null;  // "G", "H", "I" など

  // カード情報
  name_ja:          string | null;  // "ピカチュウ"
  rarity:           string | null;  // "C", "R", "SR", "SAR" など
  card_type:        string | null;  // "ポケモン" / "トレーナーズ" / "エネルギー"
  hp:               number | null;  // 230（ポケモンのみ）

  // メタ情報
  confidence:       number;         // 0〜1
  data_source:      "gemini" | "tcgdex" | "gemini+tcgdex";
  tcgdex_id:        string | null;  // TCGdex カード ID（例: "sv4a-1"）
};

export type GeminiOcrResponse = OcrCardResult;
```

---

### B-2. prompt.ts を更新

**ファイル**: `app/web/lib/ocr/prompt.ts`  
**変更**: 底部ストリップ解析を強化した v2 プロンプトに置換

```typescript
export const CARD_OCR_PROMPT = `あなたはポケモンカードゲームの専門家です。
提供された画像を解析し、以下の情報を JSON 形式で抽出してください。

【最優先】カード左下の識別ストリップ（4フィールドが並ぶ帯）:
  1. 規制マーク: 青枠内の1文字（A〜I のいずれか）
  2. セットコード: 紫枠内のコード（正規表現パターン: SV\d+[a-z]?、例: SV4a, SV8）
  3. カード番号: 緑枠内の番号（形式: 3桁/3桁、例: 001/165, 193/190）
  4. レアリティ: 赤枠内のコード（C/U/R/RR/AR/SR/SAR/UR/ACE のいずれか）

注意: カード番号の分子が分母を超える場合（例: 193/190）はシークレットレア（SR以上）。

【次に優先】カード上部のカード情報:
  5. カード名（日本語）: カード上部の大きなテキスト
  6. カード種類: ポケモン / トレーナーズ / エネルギー
  7. HP: ポケモンカードの場合のみ、"HP NNN" の数値

serial_number は set_code と card_number_text をアンダースコアで結合（例: SV4a_001/165）。
どちらかが不明な場合は null。

confidence は 0〜1 で、全体的な抽出信頼度を示す。
底部ストリップが鮮明に読めた場合は 0.85 以上。

必ず以下の JSON スキーマのみを出力してください（余計なテキスト不要）:
{
  "serial_number": string | null,
  "set_code": string | null,
  "card_number_text": string | null,
  "regulation_mark": string | null,
  "name_ja": string | null,
  "rarity": string | null,
  "card_type": string | null,
  "hp": number | null,
  "confidence": number
}`;
```

---

### B-3. gemini.ts を更新

**ファイル**: `app/web/lib/ocr/gemini.ts`  
**変更**: モデルを `gemini-2.5-flash-preview-04-17` に変更、返り値に `data_source` と `tcgdex_id` を追加

```typescript
import "server-only";
import { VertexAI } from "@google-cloud/vertexai";
import { CARD_OCR_PROMPT } from "./prompt";
import type { OcrCardResult } from "./schema";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-preview-04-17";
const LOCATION = process.env.VERTEX_AI_LOCATION ?? "asia-northeast1";

let vertexClient: VertexAI | null = null;

function getVertexClient(): VertexAI {
  if (!vertexClient) {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required");
    vertexClient = new VertexAI({ project, location: LOCATION });
  }
  return vertexClient;
}

export async function extractCardFromImage(
  imageBytes: Buffer,
  mimeType: string
): Promise<OcrCardResult> {
  const vertex = getVertexClient();
  const model = vertex.preview.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      maxOutputTokens: 512,
      temperature: 0,
      responseMimeType: "application/json",
    },
  });

  const base64Image = imageBytes.toString("base64");

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64Image } },
          { text: CARD_OCR_PROMPT },
        ],
      },
    ],
  });

  const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  try {
    const parsed = JSON.parse(text) as Partial<OcrCardResult>;

    // serial_number を組み立て
    let serial = parsed.serial_number ?? null;
    if (!serial && parsed.set_code && parsed.card_number_text) {
      serial = `${parsed.set_code}_${parsed.card_number_text}`;
    }

    return {
      serial_number:    serial,
      set_code:         parsed.set_code ?? null,
      card_number_text: parsed.card_number_text ?? null,
      regulation_mark:  parsed.regulation_mark ?? null,
      name_ja:          parsed.name_ja ?? null,
      rarity:           parsed.rarity ?? null,
      card_type:        parsed.card_type ?? null,
      hp:               typeof parsed.hp === "number" ? parsed.hp : null,
      confidence:       typeof parsed.confidence === "number" ? parsed.confidence : 0,
      data_source:      "gemini",
      tcgdex_id:        null,
    };
  } catch {
    return {
      serial_number: null, set_code: null, card_number_text: null,
      regulation_mark: null, name_ja: null, rarity: null,
      card_type: null, hp: null, confidence: 0,
      data_source: "gemini", tcgdex_id: null,
    };
  }
}
```

---

### B-4. tcgdex.ts を新規作成

**ファイル**: `app/web/lib/ocr/tcgdex.ts`（新規）

```typescript
/**
 * TCGdex API ルックアップ
 * https://api.tcgdex.net/v2/ja/cards/{setCode}/{localId}
 *
 * setCode: "sv4a", "sv8" など（小文字）
 * localId: "1", "165" など（ゼロ埋めなし）
 */
import type { OcrCardResult } from "./schema";

const BASE = process.env.TCGDEX_API_BASE ?? "https://api.tcgdex.net/v2/ja";

type TcgdexCard = {
  id: string;
  localId: string;
  name: string;
  hp?: number;
  rarity?: string;
  category?: string;       // "Pokemon" / "Trainer" / "Energy"
  regulationMark?: string;
  suffix?: string;         // "EX", "GX" など
};

const RARITY_MAP: Record<string, string> = {
  "Common":               "C",
  "Uncommon":             "U",
  "Rare":                 "R",
  "Double Rare":          "RR",
  "Art Rare":             "AR",
  "Super Rare":           "SR",
  "Special Art Rare":     "SAR",
  "Ultra Rare":           "UR",
  "Illustration Rare":    "IR",
  "Special Illustration Rare": "SIR",
  "Hyper Rare":           "HR",
  "ACE SPEC Rare":        "ACE",
  "Shiny Rare":           "S",
  "Shiny Ultra Rare":     "SS",
};

const CATEGORY_MAP: Record<string, string> = {
  "Pokemon":  "ポケモン",
  "Trainer":  "トレーナーズ",
  "Energy":   "エネルギー",
};

function toLocalId(cardNumberText: string): string {
  // "001/165" → "1"（ゼロ埋めなし、分子のみ）
  const parts = cardNumberText.split("/");
  return String(parseInt(parts[0], 10));
}

export async function lookupByCardNumber(
  setCode: string,
  cardNumberText: string
): Promise<Partial<OcrCardResult> | null> {
  const localId = toLocalId(cardNumberText);
  const url = `${BASE}/cards/${setCode.toLowerCase()}/${localId}`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 },  // 24h キャッシュ
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const card = (await res.json()) as TcgdexCard;

    return {
      name_ja:         card.name ?? null,
      rarity:          RARITY_MAP[card.rarity ?? ""] ?? card.rarity ?? null,
      card_type:       CATEGORY_MAP[card.category ?? ""] ?? null,
      hp:              card.hp ?? null,
      regulation_mark: card.regulationMark ?? null,
      tcgdex_id:       card.id ?? null,
    };
  } catch {
    return null;
  }
}
```

---

### B-5. pipeline.ts を新規作成

**ファイル**: `app/web/lib/ocr/pipeline.ts`（新規）  
2 段階処理のオーケストレーター

```typescript
import "server-only";
import { extractCardFromImage } from "./gemini";
import { lookupByCardNumber } from "./tcgdex";
import type { OcrCardResult } from "./schema";

const CONFIDENCE_THRESHOLD = 0.7;

/**
 * メイン OCR パイプライン
 *   1. Gemini 2.5 Flash で画像を解析
 *   2. confidence ≥ 0.7 かつ識別フィールドあり → TCGdex で補完
 */
export async function runOcrPipeline(
  imageBytes: Buffer,
  mimeType: string
): Promise<OcrCardResult> {
  // Stage 1: Gemini OCR
  const geminiResult = await extractCardFromImage(imageBytes, mimeType);

  // Stage 2: TCGdex 補完（条件付き）
  const canLookup =
    geminiResult.confidence >= CONFIDENCE_THRESHOLD &&
    geminiResult.set_code &&
    geminiResult.card_number_text;

  if (!canLookup) {
    return geminiResult;
  }

  const tcgdexData = await lookupByCardNumber(
    geminiResult.set_code!,
    geminiResult.card_number_text!
  );

  if (!tcgdexData) {
    // TCGdex ミス → Gemini データのみ
    return geminiResult;
  }

  // TCGdex データで Gemini 結果を上書き（公式データを優先）
  return {
    ...geminiResult,
    name_ja:         tcgdexData.name_ja         ?? geminiResult.name_ja,
    rarity:          tcgdexData.rarity          ?? geminiResult.rarity,
    card_type:       tcgdexData.card_type        ?? geminiResult.card_type,
    hp:              tcgdexData.hp               ?? geminiResult.hp,
    regulation_mark: tcgdexData.regulation_mark  ?? geminiResult.regulation_mark,
    tcgdex_id:       tcgdexData.tcgdex_id        ?? null,
    data_source:     "gemini+tcgdex",
  };
}
```

---

## Phase C: API エンドポイント

### C-1. import/route.ts を Cloud Tasks 化

**ファイル**: `app/web/app/api/staging/import/route.ts`  
**変更内容**: OCR 同期処理を完全削除 → GCS 保存 + ocr_jobs 作成 + Cloud Tasks エンキュー

以下のロジックで**完全置換**する:

```typescript
import { NextResponse } from "next/server";
import { parseLocationCode } from "@/lib/storage-layout";
import { isDatabaseConfigured } from "@/lib/server-data";
import { requireOperatorOrAdminUser } from "@/lib/authz";
import { getRequiredEnv, getStorageClient, getTasksClient } from "@/lib/gcp";
import { getPool } from "@/lib/db/pool";

const MAX_FILES = 500;  // 100 → 500 に変更
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { message: "DATABASE_URL 未設定のため、一括取り込みは利用できません。" },
      { status: 503 }
    );
  }

  const authz = await requireOperatorOrAdminUser();
  if (!authz.ok) {
    return NextResponse.json({ message: authz.message }, { status: authz.status });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ message: "フォームデータが不正です。" }, { status: 400 });
  }

  const locationCodeRaw = String(form.get("input_location_code") ?? "").trim();
  if (!parseLocationCode(locationCodeRaw)) {
    return NextResponse.json(
      { message: "保管場所コードは tier-box-col 形式（例: 1-2-3）で入力してください。" },
      { status: 400 }
    );
  }

  const files = form
    .getAll("files")
    .filter((x): x is File => x instanceof File && x.size > 0)
    .slice(0, MAX_FILES);

  if (files.length === 0) {
    return NextResponse.json({ message: "画像ファイルを選択してください。" }, { status: 400 });
  }

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { message: `ファイルサイズ上限（5MB）を超えています: ${file.name}` },
        { status: 400 }
      );
    }
  }

  const bucketName  = getRequiredEnv("GCS_BUCKET");
  const project     = getRequiredEnv("GOOGLE_CLOUD_PROJECT");
  const queueLocation = getRequiredEnv("CLOUD_TASKS_LOCATION");
  const queueName   = getRequiredEnv("CLOUD_TASKS_QUEUE");
  const workerUrl   = getRequiredEnv("CLOUD_TASKS_WORKER_URL");
  const taskSa      = process.env.CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL?.trim();
  const workerSecret = process.env.OCR_WORKER_SHARED_SECRET?.trim();

  const storage = getStorageClient();
  const bucket  = storage.bucket(bucketName);
  const pool    = getPool();
  const batchId = `batch_${Date.now().toString(36)}`;
  const jobIds: string[] = [];

  // GCS 保存 + ocr_jobs INSERT
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const ext   = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const objectPath = `ocr-uploads/${batchId}/${crypto.randomUUID()}.${ext}`;

    await bucket.file(objectPath).save(bytes, {
      resumable: false,
      contentType: file.type || "application/octet-stream",
      metadata: { cacheControl: "private, max-age=0, no-cache" },
    });

    const { rows } = await pool.query<{ job_id: string }>(
      `INSERT INTO ocr_jobs
         (batch_id, source, gcs_bucket, gcs_object_path, file_name, input_location_code, created_by)
       VALUES ($1, 'WEB_UPLOAD', $2, $3, $4, $5, $6)
       RETURNING job_id`,
      [batchId, bucketName, objectPath, file.name, locationCodeRaw, authz.user.id]
    );
    jobIds.push(rows[0].job_id);
  }

  // Cloud Tasks エンキュー
  const tasksClient = getTasksClient();
  const queuePath   = tasksClient.queuePath(project, queueLocation, queueName);

  for (const jobId of jobIds) {
    const task: Record<string, unknown> = {
      httpRequest: {
        httpMethod: "POST",
        url: workerUrl.replace(/\/$/, ""),
        headers: {
          "Content-Type": "application/json",
          ...(workerSecret ? { "X-OCR-Secret": workerSecret } : {}),
        },
        body: Buffer.from(JSON.stringify({ job_id: jobId })).toString("base64"),
        ...(taskSa ? { oidcToken: { serviceAccountEmail: taskSa } } : {}),
      },
    };
    await tasksClient.createTask({ parent: queuePath, task });
  }

  const estimatedMinutes = Math.ceil((jobIds.length * 6) / 10 / 60);

  return NextResponse.json({
    ok: true,
    batch_id: batchId,
    count: jobIds.length,
    estimated_minutes: estimatedMinutes,
  });
}
```

---

### C-2. process-job/route.ts を新規作成

**ファイル**: `app/web/app/api/ocr/process-job/route.ts`（新規ディレクトリも作成）

```typescript
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getStorageClient } from "@/lib/gcp";
import { runOcrPipeline } from "@/lib/ocr/pipeline";

export async function POST(request: Request) {
  // シークレット検証
  const secret = process.env.OCR_WORKER_SHARED_SECRET?.trim();
  if (secret) {
    const provided = request.headers.get("x-ocr-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json().catch(() => null);
  const jobId: string | undefined = body?.job_id;
  if (!jobId) {
    return NextResponse.json({ error: "job_id required" }, { status: 400 });
  }

  const pool = getPool();

  // ocr_jobs を取得
  const { rows: jobRows } = await pool.query<{
    job_id: string;
    batch_id: string;
    gcs_bucket: string;
    gcs_object_path: string;
    file_name: string | null;
    input_location_code: string | null;
    created_by: string | null;
    attempt_count: number;
    status: string;
  }>(
    `UPDATE ocr_jobs
     SET status = 'RUNNING', attempt_count = attempt_count + 1, updated_at = now()
     WHERE job_id = $1 AND status IN ('QUEUED', 'RETRY')
     RETURNING *`,
    [jobId]
  );

  if (jobRows.length === 0) {
    return NextResponse.json({ error: "Job not found or already processing" }, { status: 404 });
  }

  const job = jobRows[0];

  try {
    // GCS から画像を取得
    const storage = getStorageClient();
    const [imageBytes] = await storage
      .bucket(job.gcs_bucket)
      .file(job.gcs_object_path)
      .download();

    const ext = job.gcs_object_path.split(".").pop()?.toLowerCase() ?? "jpg";
    const mimeType = ext === "png" ? "image/png" : "image/jpeg";

    // OCR パイプライン実行（Gemini + TCGdex）
    const ocr = await runOcrPipeline(Buffer.from(imageBytes), mimeType);

    // 重複候補チェック
    let duplicateStatus = "NONE";
    let duplicateCardId: string | null = null;
    if (ocr.serial_number) {
      const { rows: dup } = await pool.query<{ card_id: string }>(
        `SELECT card_id FROM cards WHERE card_id = $1 LIMIT 1`,
        [ocr.serial_number]
      );
      if (dup.length > 0) {
        duplicateStatus = "CANDIDATE";
        duplicateCardId = dup[0].card_id;
      }
    }

    // ocr_staging INSERT
    const stgId = `stg_${job.batch_id}_${crypto.randomUUID().slice(0, 8)}`;
    await pool.query(
      `INSERT INTO ocr_staging (
         stg_id, drive_file_id, file_name, image_url,
         serial_number, set_code, card_number_text, regulation_mark,
         name_ja, rarity, card_type, hp,
         qty, status, review_status,
         input_location_code, batch_id, source,
         duplicate_status, duplicate_card_id,
         ocr_status, ocr_job_id, reviewer_id,
         confidence, tcgdex_id, ocr_engine, data_source,
         ai_json
       ) VALUES (
         $1, $2, $3, $4,
         $5, $6, $7, $8,
         $9, $10, $11, $12,
         1, '登録待ち', 'PENDING',
         $13, $14, 'WEB_UPLOAD',
         $15, $16,
         'SUCCEEDED', $17, $18,
         $19, $20, 'gemini-2.5-flash', $21,
         $22::jsonb
       )`,
      [
        stgId,
        `job_${jobId}`,  // drive_file_id は nullable になったが念のため設定
        job.file_name,
        `https://storage.googleapis.com/${job.gcs_bucket}/${encodeURI(job.gcs_object_path)}`,
        ocr.serial_number, ocr.set_code, ocr.card_number_text, ocr.regulation_mark,
        ocr.name_ja, ocr.rarity, ocr.card_type, ocr.hp,
        job.input_location_code, job.batch_id,
        duplicateStatus, duplicateCardId,
        jobId, job.created_by,
        ocr.confidence, ocr.tcgdex_id, ocr.data_source,
        JSON.stringify({ confidence: ocr.confidence, source: ocr.data_source }),
      ]
    );

    // ocr_jobs を SUCCEEDED に更新、stg_id を紐づけ
    await pool.query(
      `UPDATE ocr_jobs SET status = 'SUCCEEDED', stg_id = $1, updated_at = now() WHERE job_id = $2`,
      [stgId, jobId]
    );

    return NextResponse.json({ ok: true, stg_id: stgId });

  } catch (err) {
    const lastError = err instanceof Error ? err.message : String(err);

    // attempt_count に基づいてリトライ or 最終失敗
    const maxAttempts = 3;
    const newStatus = job.attempt_count >= maxAttempts ? "FAILED" : "RETRY";

    await pool.query(
      `UPDATE ocr_jobs
       SET status = $1, last_error = $2, updated_at = now()
       WHERE job_id = $3`,
      [newStatus, lastError, jobId]
    );

    // RETRY の場合: HTTP 500 → Cloud Tasks が自動リトライ
    // FAILED の場合: HTTP 200 → それ以上リトライさせない
    if (newStatus === "RETRY") {
      return NextResponse.json({ error: lastError }, { status: 500 });
    }
    return NextResponse.json({ ok: false, error: lastError, status: "FAILED" });
  }
}
```

---

### C-3. batch-status/route.ts を新規作成

**ファイル**: `app/web/app/api/staging/batch-status/route.ts`（新規）

```typescript
import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { isDatabaseConfigured } from "@/lib/server-data";

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ batches: [] });
  }

  const { searchParams } = new URL(request.url);
  const batchIdsParam = searchParams.get("batch_ids") ?? searchParams.get("batch_id");
  if (!batchIdsParam) {
    return NextResponse.json({ error: "batch_ids required" }, { status: 400 });
  }

  const batchIds = batchIdsParam.split(",").filter(Boolean).slice(0, 20);
  const pool = getPool();

  const { rows } = await pool.query<{
    batch_id: string;
    total: string;
    queued: string;
    running: string;
    succeeded: string;
    failed: string;
  }>(
    `SELECT
       batch_id,
       COUNT(*)                                           AS total,
       COUNT(*) FILTER (WHERE status = 'QUEUED')          AS queued,
       COUNT(*) FILTER (WHERE status = 'RUNNING')         AS running,
       COUNT(*) FILTER (WHERE status IN ('SUCCEEDED'))    AS succeeded,
       COUNT(*) FILTER (WHERE status IN ('FAILED'))       AS failed
     FROM ocr_jobs
     WHERE batch_id = ANY($1::text[])
     GROUP BY batch_id`,
    [batchIds]
  );

  const batches = rows.map((r) => {
    const total     = parseInt(r.total);
    const queued    = parseInt(r.queued);
    const running   = parseInt(r.running);
    const succeeded = parseInt(r.succeeded);
    const failed    = parseInt(r.failed);
    return {
      batch_id:  r.batch_id,
      total,
      queued,
      running,
      succeeded,
      failed,
      completed: queued === 0 && running === 0,
    };
  });

  return NextResponse.json({ batches });
}
```

---

## Phase D: フロントエンド更新

### D-1. import/page.tsx

**ファイル**: `app/web/app/(dashboard)/staging/import/page.tsx`

変更点:
1. 上限表示を「最大 100 件」→「最大 500 件」
2. アップロード成功後に `batch_id` を `sessionStorage` に保存
3. 「登録待ち一覧で確認」リンクを表示

```typescript
// 成功時の処理（handleSubmit 内）:
if (res.ok) {
  const data = body as { batch_id: string; count: number; estimated_minutes: number };
  // sessionStorage に保存（一覧ページでポーリングに使う）
  const saved = JSON.parse(sessionStorage.getItem("pendingBatches") ?? "[]") as string[];
  saved.push(data.batch_id);
  sessionStorage.setItem("pendingBatches", JSON.stringify(saved));

  setMessage({
    type: "success",
    text: `取り込みを受け付けました（${data.count}件）。完了まで約 ${data.estimated_minutes} 分です。`,
  });
}
```

---

### D-2. staging/page.tsx にポーリング追加

**ファイル**: `app/web/app/(dashboard)/staging/page.tsx`

現在はサーバーコンポーネント。ポーリング用のクライアントコンポーネントを分離して追加する。

**新規ファイル** `app/web/components/staging/batch-progress.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type BatchStatus = {
  batch_id: string;
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  completed: boolean;
};

export function BatchProgress() {
  const router = useRouter();
  const [progress, setProgress] = useState<BatchStatus[]>([]);

  useEffect(() => {
    const saved = JSON.parse(sessionStorage.getItem("pendingBatches") ?? "[]") as string[];
    if (saved.length === 0) return;

    const poll = async () => {
      const res = await fetch(`/api/staging/batch-status?batch_ids=${saved.join(",")}`);
      if (!res.ok) return;
      const { batches } = (await res.json()) as { batches: BatchStatus[] };
      setProgress(batches);

      const allDone = batches.every((b) => b.completed);
      if (allDone) {
        sessionStorage.removeItem("pendingBatches");
        router.refresh();
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [router]);

  const pending = progress.filter((b) => !b.completed);
  if (pending.length === 0) return null;

  const total     = pending.reduce((s, b) => s + b.total, 0);
  const succeeded = pending.reduce((s, b) => s + b.succeeded, 0);
  const pct = total > 0 ? Math.round((succeeded / total) * 100) : 0;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-primary">
          OCR 処理中: {succeeded}/{total} 件
        </span>
        <span className="text-xs text-muted-foreground">{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/20">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
```

**staging/page.tsx への追加**（ヘッダー部分の直下に挿入）:

```typescript
// import 追加
import { BatchProgress } from "@/components/staging/batch-progress";

// JSX 内、h1 の下に追加
<BatchProgress />
```

---

## 動作確認チェックリスト

### Phase A 確認
- [ ] `ocr_jobs` に `file_name`, `input_location_code`, `stg_id` カラムが存在する
- [ ] `ocr_staging.drive_file_id` が nullable になっている
- [ ] `ocr_staging` に `tcgdex_id`, `ocr_engine`, `data_source` カラムが存在する

### Phase B 確認
- [ ] `app/web/lib/ocr/` に `schema.ts`, `prompt.ts`, `gemini.ts`, `tcgdex.ts`, `pipeline.ts` が存在する
- [ ] TypeScript エラーなし（`npx tsc --noEmit` で確認）

### Phase C 確認
- [ ] `import/route.ts` に `extractCardFromImage` の import がない（Cloud Tasks 化完了）
- [ ] `app/web/app/api/ocr/process-job/route.ts` が存在する
- [ ] `app/web/app/api/staging/batch-status/route.ts` が存在する
- [ ] ブラウザで `/staging/import` を開き、ファイル選択 UI が「最大 500 件」表示になっている

### Phase D 確認
- [ ] `components/staging/batch-progress.tsx` が存在する
- [ ] `/staging` ページにポーリングバーが追加されている（sessionStorage に batch_id がある場合）

---

## 環境変数（追加分）

`.env.local` に以下を追加（既存変数は変更なし）:

```bash
# Cloud Tasks ワーカー URL（自分のアプリの URL + エンドポイント）
CLOUD_TASKS_WORKER_URL=https://your-app.com/api/ocr/process-job

# Gemini モデル（省略時: gemini-2.5-flash-preview-04-17）
GEMINI_MODEL=gemini-2.5-flash-preview-04-17

# TCGdex API（省略時: https://api.tcgdex.net/v2/ja）
TCGDEX_API_BASE=https://api.tcgdex.net/v2/ja
```

既存変数の確認（これらが設定済みであること）:
```bash
GOOGLE_CLOUD_PROJECT=
GCS_BUCKET=
CLOUD_TASKS_LOCATION=
CLOUD_TASKS_QUEUE=
CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL=
OCR_WORKER_SHARED_SECRET=
DATABASE_URL=
VERTEX_AI_LOCATION=asia-northeast1
```

---

## 注意事項・落とし穴

1. **`gcp.ts` の `getRequiredEnv`**: `CLOUD_TASKS_WORKER_URL` は新しく使う環境変数。未設定だと実行時エラー。
2. **`ocr_staging.drive_file_id` の UNIQUE 制約**: nullable になっても UNIQUE 制約は残るため、`job_${jobId}` のような一意な値を入れること（NULL は UNIQUE 制約外）。
3. **TCGdex API のレート制限**: 明示的な制限なし（オープン API）だが、念のため `next: { revalidate: 86400 }` でキャッシュを活用。
4. **Cloud Tasks のリトライ**: `process-job` が HTTP 5xx を返した場合のみリトライされる。`attempt_count >= 3` の場合は HTTP 200 を返して FAILED にする。
5. **`hp` フィールドの型**: `ocr_staging` の既存スキーマに `hp` カラムがない場合は INSERT 文から除外する（Phase B 後に確認すること）。
6. **デモモード**: `isDatabaseConfigured()` が false の場合、import は 503 を返すため demo データへの影響なし。
