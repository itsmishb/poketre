import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getStorageClient } from "@/lib/gcp";
import { runOcrPipeline } from "@/lib/ocr/pipeline";

/**
 * POST /api/ocr/process-job
 *
 * Cloud Tasks ワーカーエンドポイント。
 * 1 リクエスト = 1 ジョブ（1 画像）を処理する。
 *
 * リクエストボディ: { job_id: string }
 * 認証: X-OCR-Secret ヘッダー（オプション）または OIDC トークン
 *
 * レスポンス:
 *   - 200: 成功 / 最終失敗（Cloud Tasks がリトライしない）
 *   - 400: リクエスト不正
 *   - 401: 認証失敗
 *   - 404: ジョブ未発見 / 処理済み
 *   - 500: 一時エラー（Cloud Tasks が自動リトライ）
 */
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

  // ocr_jobs を RUNNING に更新（同時実行防止）
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

    // OCR パイプライン実行（Gemini 2.5 Flash + TCGdex 補完）
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
        `job_${jobId}`,  // drive_file_id は nullable だが一意な値を設定
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

    // RETRY: HTTP 500 → Cloud Tasks が自動リトライ
    // FAILED: HTTP 200 → それ以上リトライさせない
    if (newStatus === "RETRY") {
      return NextResponse.json({ error: lastError }, { status: 500 });
    }
    return NextResponse.json({ ok: false, error: lastError, status: "FAILED" });
  }
}
