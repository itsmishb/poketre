# OCR 処理 Next.js 移行計画

更新日: 2026-04-13  
対象: `cloud_run_service/` → `app/web/app/api/ocr/` への完全移行

---

## 1. 背景と目的

### 1.1 現状のアーキテクチャ

```
[Web UI] ---(files + location_code)---> [/api/staging/import]
              |
              ├── GCS にアップロード (ocr-uploads/)
              ├── ocr_jobs テーブルに INSERT
              └── Cloud Tasks にジョブをエンキュー
                        |
                        v
              [Cloud Run: Python Flask]   ← 本移行の対象
                        |
                        ├── Google Drive ポーリング  ← 廃止
                        ├── Gemini API 呼び出し
                        ├── Google Sheets 書き込み  ← 廃止
                        └── PostgreSQL INSERT (ocr_staging)
```

### 1.2 現状の課題

| 課題 | 詳細 |
|------|------|
| 二重メンテナンス | Python + Node.js の 2 言語体制で管理コストが高い |
| Google Drive 依存 | Drive ポーリングによる複雑なロック機構が不要な複雑性を生んでいる |
| Google Sheets 依存 | 中間ストアとして Sheets を使う構成は本来不要 |
| デプロイの独立 | Cloud Run の別デプロイが必要（CI/CD の複雑化） |
| 認証方式 | 共有シークレット（`OCR_WORKER_SHARED_SECRET`）のみで Workload Identity 未使用 |
| ローカル開発 | Cloud Run を模倣するためのセットアップが煩雑 |

### 1.3 移行の目的

- Python Cloud Run を廃止し、Next.js API Route に一本化
- Google Drive / Google Sheets への依存を完全に除去
- `@google-cloud/vertexai`（既にインストール済み）を再利用してコスト削減
- ローカル開発をシンプル化（Docker Compose + Next.js のみで完結）
- 将来的な Workload Identity 対応を容易にする

---

## 2. 移行後のアーキテクチャ

### 2.1 フロー概要

```
[Web UI: /staging/import]
        |
        | multipart FormData (files + location_code)
        v
[Next.js: /api/staging/import]  ← 既存、一部改修
        |
        ├── GCS にアップロード (ocr-uploads/{batch_id}/{filename})
        ├── ocr_jobs に QUEUED で INSERT
        └── /api/ocr/process を非同期呼び出し（setImmediate または自己 fetch）
                    |
                    v
        [Next.js: /api/ocr/process]  ← 新規作成
                    |
                    ├── ocr_jobs を RUNNING に更新
                    ├── GCS から画像をダウンロード
                    ├── 画像前処理（リサイズ・JPEG 変換）
                    ├── Vertex AI Gemini 呼び出し
                    │       └── Primary モデル失敗時は Secondary にフォールバック
                    ├── JSON レスポンス解析・バリデーション
                    ├── ocr_staging に INSERT または UPDATE
                    ├── 重複候補チェック
                    └── ocr_jobs を SUCCEEDED / FAILED に更新
```

### 2.2 バックグラウンド処理の実装方針

Next.js の API Route は同期的に応答するため、OCR の重い処理（数秒〜数十秒）は非同期実行する。

**方式A: 自己 HTTP 呼び出し（推奨）**

`/api/staging/import` がレスポンスを返した後、`fetch('/api/ocr/process', { method: 'POST', body })` を `waitUntil` または `setImmediate` で非同期実行する。

```ts
// /api/staging/import/route.ts（改修後）
export async function POST(req: Request) {
  // ... GCS アップロード + ocr_jobs INSERT ...

  // 非同期で OCR を起動（レスポンスを待たない）
  const processUrl = `${process.env.WORKER_URL}/api/ocr/process`;
  for (const job of createdJobs) {
    fetch(processUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OCR_WORKER_SHARED_SECRET}`,
      },
      body: JSON.stringify({ job_id: job.job_id }),
    }).catch((err) => console.error('OCR dispatch failed', err));
  }

  return Response.json({ ok: true, batch_id, count, queued_jobs: createdJobs.length });
}
```

**方式B: Cloud Tasks（現状維持・将来廃止）**

既存の Cloud Tasks キューをそのまま使い、エンドポイントだけを Cloud Run → Next.js に切り替える。
移行期の互換性を保ちたい場合のみ採用。

> **採用方式: A（自己 HTTP 呼び出し）**  
> Cloud Tasks への依存を減らしてシンプルにする。ただし Vercel にデプロイする場合は  
> 関数タイムアウト（60 秒）に注意し、大量バッチ時は方式 B に切り替える。

---

## 3. 新規ファイル構成

```
app/web/
  app/api/
    ocr/
      process/
        route.ts          ← OCR 実行本体（認証チェック + 処理ディスパッチ）
      status/
        [job_id]/
          route.ts        ← ジョブ状態確認（ポーリング用）

  lib/
    ocr/
      index.ts            ← 公開 API（processOcrJob）
      gemini.ts           ← Vertex AI Gemini 呼び出しロジック
      image-prep.ts       ← 画像前処理（GCS ダウンロード + リサイズ）
      prompt.ts           ← Gemini プロンプト定義
      schema.ts           ← OCR 結果の型定義・バリデーション
      duplicate-check.ts  ← 重複候補チェックロジック
      job-runner.ts       ← ジョブ実行管理（RUNNING/SUCCEEDED/FAILED 更新）
```

---

## 4. 各ファイルの詳細仕様

### 4.1 `lib/ocr/schema.ts` — OCR 結果型定義

Python 側のレスポンススキーマを TypeScript へ移植する。

```ts
// Gemini から返ってくる JSON の型
export interface OcrResult {
  card_name: string | null;
  card_name_reading: string | null;
  card_type: 'ポケモン' | 'トレーナーズ' | 'エネルギー' | 'その他' | null;
  poke_type: string | null;
  hp: number | null;
  set_code: string | null;
  card_number: string | null;
  rarity: string | null;
  holo: boolean | null;
  illustrator: string | null;
  generation: string | null;
  regulation_mark: string | null;
  is_psa_slab: boolean;
  psa_grade: number | null;
  psa_cert_number: string | null;
  condition_notes: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  ambiguity_notes: string | null;
}

// バリデーション関数
export function validateOcrResult(raw: unknown): OcrResult { ... }

// ocr_staging への INSERT 用にマッピング
export function ocrResultToStagingRow(
  result: OcrResult,
  jobId: string,
  imageUrl: string,
  locationCode: string,
): Omit<StagingInsert, 'stg_id' | 'created_at' | 'updated_at'> { ... }
```

### 4.2 `lib/ocr/prompt.ts` — Gemini プロンプト

Python `main.py` の `GEMINI_PROMPT` を TypeScript へ移植。

```ts
export const SYSTEM_PROMPT = `
あなたはポケモンカードの画像を解析する専門家です。
提供された画像から以下の情報を JSON 形式で抽出してください。

【抽出項目】
- card_name: カード名（日本語）
- card_type: カード種別（ポケモン / トレーナーズ / エネルギー / その他）
- poke_type: ポケモンのタイプ（炎・水・草・電気 等、複数の場合はカンマ区切り）
- set_code: セットコード（例: BW、XY、SM、SV）
- card_number: カード番号（例: 001/100）
- rarity: レアリティ（C / U / R / RR / SR / SAR / UR / CSR 等）
- holo: キラ加工の有無（true / false）
- illustrator: イラストレーター名
- is_psa_slab: PSA スラブかどうか（true / false）
- psa_grade: PSA グレード（1〜10、スラブでない場合は null）
- psa_cert_number: PSA 認証番号（スラブでない場合は null）
- confidence: 読み取り信頼度（HIGH / MEDIUM / LOW）
- ambiguity_notes: 判断が困難だった点（なければ null）

【注意事項】
- 読み取れない項目は null を返す
- カード名は必ず日本語で返す
- レアリティは公式表記に従う
- JSON のみを返し、説明文は不要
`.trim();

export const RESPONSE_SCHEMA = { ... }; // Gemini の responseSchema 用
```

### 4.3 `lib/ocr/image-prep.ts` — 画像前処理

```ts
import { Storage } from '@google-cloud/storage';

interface PreparedImage {
  base64Data: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  originalSize: number;
  processedSize: number;
}

/**
 * GCS から画像をダウンロードし、Gemini 送信用に前処理する
 * - 最大 1024px にリサイズ（アスペクト比維持）
 * - JPEG に変換（PNG / WebP 入力の場合も）
 * - Base64 エンコード
 *
 * Node.js 環境では `sharp` を使用する（npm install sharp）
 */
export async function prepareImageFromGcs(
  bucket: string,
  objectPath: string,
): Promise<PreparedImage> { ... }

/**
 * Buffer から直接前処理（テスト用）
 */
export async function prepareImageFromBuffer(
  buffer: Buffer,
  mimeType: string,
): Promise<PreparedImage> { ... }
```

追加パッケージ:

```bash
npm install sharp
npm install --save-dev @types/sharp
```

### 4.4 `lib/ocr/gemini.ts` — Vertex AI Gemini 呼び出し

```ts
import { VertexAI } from '@google-cloud/vertexai';

// Python 側と同様のデュアルモデルヘッジング
const PRIMARY_MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-001';
const SECONDARY_MODEL = 'gemini-1.5-flash-002'; // フォールバック

interface GeminiCallOptions {
  imageBase64: string;
  mimeType: string;
  timeoutMs?: number;
}

/**
 * Primary モデルで試行し、タイムアウト or エラー時は Secondary にフォールバック
 */
export async function callGeminiWithFallback(
  opts: GeminiCallOptions,
): Promise<{ raw: string; model: string }> { ... }

/**
 * 単一モデルへの呼び出し
 */
async function callGeminiModel(
  model: string,
  opts: GeminiCallOptions,
): Promise<string> { ... }
```

### 4.5 `lib/ocr/job-runner.ts` — ジョブ実行管理

```ts
import { pool } from '@/lib/db/pool';
import { prepareImageFromGcs } from './image-prep';
import { callGeminiWithFallback } from './gemini';
import { validateOcrResult, ocrResultToStagingRow } from './schema';
import { checkDuplicate } from './duplicate-check';

export interface OcrJobRunResult {
  job_id: string;
  status: 'SUCCEEDED' | 'FAILED';
  stg_id?: string;
  error?: string;
}

/**
 * 1 ジョブの OCR 処理を実行する
 * - ocr_jobs を RUNNING に更新
 * - 画像前処理 + Gemini 呼び出し
 * - ocr_staging に INSERT
 * - 重複候補チェック
 * - ocr_jobs を SUCCEEDED / FAILED に更新
 * - 失敗時のリトライカウント更新
 */
export async function runOcrJob(jobId: string): Promise<OcrJobRunResult> {
  const client = await pool.connect();
  try {
    // 1. ジョブ取得 + 排他ロック
    const job = await fetchAndLockJob(client, jobId);
    if (!job) throw new Error(`Job ${jobId} not found or already running`);

    // 2. RUNNING に更新
    await updateJobStatus(client, jobId, 'RUNNING');

    // 3. 画像前処理
    const image = await prepareImageFromGcs(job.gcs_bucket, job.gcs_object_path);

    // 4. Gemini 呼び出し
    const { raw, model } = await callGeminiWithFallback({
      imageBase64: image.base64Data,
      mimeType: image.mimeType,
      timeoutMs: 60_000,
    });

    // 5. JSON パース + バリデーション
    const ocrResult = validateOcrResult(JSON.parse(raw));

    // 6. stg_id 生成（Python と同様: stg_{gcs_object_path のハッシュ}）
    const stgId = generateStgId(job.gcs_object_path);

    // 7. ocr_staging に UPSERT（冪等性確保）
    const stagingRow = ocrResultToStagingRow(ocrResult, jobId, job.gcs_object_path, job.input_location_code);
    await upsertStagingRow(client, stgId, stagingRow);

    // 8. 重複候補チェック
    await checkAndMarkDuplicate(client, stgId, ocrResult);

    // 9. SUCCEEDED に更新
    await updateJobStatus(client, jobId, 'SUCCEEDED', { stg_id: stgId, model });

    return { job_id: jobId, status: 'SUCCEEDED', stg_id: stgId };

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateJobStatus(client, jobId, 'FAILED', { error: message });
    return { job_id: jobId, status: 'FAILED', error: message };
  } finally {
    client.release();
  }
}
```

### 4.6 `app/api/ocr/process/route.ts` — OCR 実行エンドポイント

```ts
import { NextRequest } from 'next/server';
import { runOcrJob } from '@/lib/ocr/job-runner';

// Cloud Tasks / 自己 fetch からの呼び出しを受け付ける
export async function POST(req: NextRequest) {
  // 認証チェック（共有シークレット）
  const auth = req.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.OCR_WORKER_SHARED_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { job_id } = await req.json();
  if (!job_id) {
    return Response.json({ error: 'job_id is required' }, { status: 400 });
  }

  // OCR 実行（同期的に完了まで待つ）
  const result = await runOcrJob(job_id);

  return Response.json(result, {
    status: result.status === 'SUCCEEDED' ? 200 : 500,
  });
}
```

### 4.7 `app/api/ocr/status/[job_id]/route.ts` — ジョブ状態確認

```ts
import { pool } from '@/lib/db/pool';

export async function GET(
  _req: Request,
  { params }: { params: { job_id: string } },
) {
  const { rows } = await pool.query(
    `SELECT job_id, status, attempt_count, last_error, created_at, updated_at
     FROM ocr_jobs WHERE job_id = $1`,
    [params.job_id],
  );

  if (rows.length === 0) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return Response.json(rows[0]);
}
```

---

## 5. 既存ファイルへの改修

### 5.1 `app/api/staging/import/route.ts`

現在: Cloud Tasks へのエンキューのみ  
変更: Cloud Tasks エンキュー後 OR 代わりに自己 fetch で `/api/ocr/process` を呼び出す

```diff
- // Cloud Tasks にエンキュー（既存コード）
+ // 環境変数で切り替え可能にする
+ if (process.env.OCR_DISPATCH_MODE === 'self') {
+   // 自己 HTTP 呼び出し（デフォルト）
+   for (const job of createdJobs) {
+     fetch(`${process.env.WORKER_URL}/api/ocr/process`, { ... })
+       .catch(console.error);
+   }
+ } else {
+   // Cloud Tasks（既存の動作を維持）
+   for (const job of createdJobs) {
+     await tasksClient.createTask({ ... });
+   }
+ }
```

### 5.2 環境変数の追加

`.env.local.example` に以下を追加:

```bash
# OCR 処理方式: 'self'（自己fetch）または 'cloud-tasks'
OCR_DISPATCH_MODE=self

# sharp のネイティブビルドが不要な場合（Vercel 環境）
# SHARP_IGNORE_GLOBAL_LIBVIPS=1
```

---

## 6. 廃止するもの

### 6.1 廃止ファイル（cloud_run_service/）

移行完了後に削除:

```
cloud_run_service/
  main.py             ← OCR 実行ロジック全体
  requirements.txt    ← Python 依存
  Dockerfile          ← コンテナ定義
```

### 6.2 廃止する外部依存

| 依存 | 廃止理由 |
|------|---------|
| Google Drive API | ファイル取得を GCS 直接に統一 |
| Google Sheets API | 中間ストアとして不要（PostgreSQL に直接書き込み）  |
| Python Cloud Run | Next.js に統合 |
| `INBOX_FOLDER_ID` 環境変数 | Drive ポーリング廃止に伴い不要 |
| `PROCESSED_FOLDER_ID` 環境変数 | 同上 |
| `ERROR_FOLDER_ID` 環境変数 | 同上 |
| `FATAL_ERROR_FOLDER_ID` 環境変数 | 同上 |
| `SPREADSHEET_ID` 環境変数 | Sheets 廃止に伴い不要 |

### 6.3 `.claude/launch.json` から削除

移行完了後、`OCR Cloud Run Service` の設定エントリを削除する。

---

## 7. 移行のリスクと対策

| リスク | 対策 |
|--------|------|
| Node.js 環境での画像処理パフォーマンス | `sharp` を採用（libvips ベースで高速）。Vercel の場合は `@squoosh/lib` または外部 API も検討 |
| Vertex AI の認証（ローカル）| `GOOGLE_APPLICATION_CREDENTIALS` または `gcloud auth application-default login` で対応 |
| 大量バッチ（50 枚超）時のタイムアウト | `OCR_DISPATCH_MODE=cloud-tasks` に切り替えてキューで分散処理 |
| 既存 Drive パイプラインとの並行稼働 | 環境変数 `OCR_WRITE_TARGET` で書き先を分岐（既存 Python サービスの動作を維持） |
| `ocr_staging.stg_id` の生成ルール差異 | Python 側の `stg_{drive_file_id}` ルールを `stg_{gcs_path_hash}` に統一し、UNIQUE 制約で冪等性を保証 |
| sharp のネイティブモジュール問題 | Vercel / Docker ビルド時に `npm rebuild sharp` を実行。Alpine イメージでは `libc` 互換性に注意 |

---

## 8. テスト計画

### 8.1 単体テスト（Vitest）

```
tests/
  lib/
    ocr/
      schema.test.ts          ← OcrResult バリデーション
      image-prep.test.ts      ← 画像リサイズ・変換（モック GCS）
      gemini.test.ts          ← Gemini 呼び出し（モック Vertex AI）
      job-runner.test.ts      ← ジョブ実行フロー（モック DB）
      duplicate-check.test.ts ← 重複候補ロジック
```

### 8.2 結合テスト

- ローカル Docker Compose（PostgreSQL）起動
- GCS はエミュレーター（`fake-gcs-server`）または実バケット（テスト用）を使用
- Gemini は実 API を使用（テスト用カード画像 5 枚でスモークテスト）

### 8.3 移行検証チェックリスト

- [ ] 同一画像の二重投入で `ocr_staging` が重複しない（UPSERT が正常動作）
- [ ] OCR 失敗時に `ocr_jobs.status = FAILED`、`last_error` が記録される
- [ ] `ocr_jobs.attempt_count` がリトライごとにインクリメントされる
- [ ] `ocr_staging.review_status = PENDING` で登録待ち一覧に表示される
- [ ] 重複候補チェックが既存カードと照合して `CANDIDATE` をセットする
- [ ] `/api/ocr/status/[job_id]` でリアルタイム状態が取得できる

---

## 9. 実装順序と工数目安

```
Day 1（ライブラリ + スキーマ）:
  AM: sharp インストール + image-prep.ts 実装・テスト
  PM: schema.ts（型定義・バリデーション）+ prompt.ts（Python から移植）

Day 2（Gemini 統合）:
  AM: gemini.ts（Vertex AI 呼び出し + デュアルモデル）
  PM: ローカルでの Gemini 動作確認（実画像 5 枚）

Day 3（ジョブランナー）:
  AM: job-runner.ts（DB トランザクション + 状態管理）
  PM: duplicate-check.ts + /api/ocr/process route

Day 4（統合 + 既存改修）:
  AM: /api/staging/import の OCR_DISPATCH_MODE 対応
  PM: /api/ocr/status route + 登録待ち UI のポーリング対応

Day 5（テスト + クリーンアップ）:
  AM: Vitest 単体テスト作成
  PM: 結合テスト + .claude/launch.json から OCR Cloud Run 削除
  PM: cloud_run_service/ の廃止判断・アーカイブ
```

---

## 10. 環境変数の最終整理

### 追加（Next.js）

| 変数名 | 説明 | 例 |
|--------|------|----|
| `OCR_DISPATCH_MODE` | `self` または `cloud-tasks` | `self` |
| `SHARP_IGNORE_GLOBAL_LIBVIPS` | Vercel 向け設定（必要な場合のみ） | `1` |

### 削除（移行完了後）

| 変数名 | 説明 |
|--------|------|
| `SPREADSHEET_ID` | Sheets 廃止 |
| `INBOX_FOLDER_ID` | Drive 廃止 |
| `PROCESSED_FOLDER_ID` | Drive 廃止 |
| `ERROR_FOLDER_ID` | Drive 廃止 |
| `FATAL_ERROR_FOLDER_ID` | Drive 廃止 |
| `GEMINI_API_KEY`（Cloud Run 側） | Python サービス廃止に伴い不要 |

### 継続使用（Next.js）

| 変数名 | 説明 |
|--------|------|
| `GOOGLE_CLOUD_PROJECT` | Vertex AI プロジェクト |
| `VERTEX_LOCATION` | Vertex AI リージョン |
| `GEMINI_MODEL` | プライマリモデル名 |
| `GCS_BUCKET` | 画像保存バケット |
| `OCR_WORKER_SHARED_SECRET` | API 認証シークレット |
| `DATABASE_URL` | PostgreSQL 接続文字列 |

---

## 11. 関連ドキュメント

- [ui-ux-redesign-plan.md](./ui-ux-redesign-plan.md) — UI/UX 全面改善計画
- [ocr-production-redesign.md](./ocr-production-redesign.md) — OCR 本番化の再設計（アーキテクチャ詳細）
- [roadmap.md](./roadmap.md) — プロジェクト全体フェーズ（本計画はフェーズ 3 に相当）
- [recommended-architecture.md](./recommended-architecture.md) — 技術選定の根拠
