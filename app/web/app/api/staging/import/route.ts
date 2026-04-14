import { NextResponse } from "next/server";
import { parseLocationCode } from "@/lib/storage-layout";
import { isDatabaseConfigured } from "@/lib/server-data";
import { requireOperatorOrAdminUser } from "@/lib/authz";
import { getRequiredEnv, getStorageClient, getTasksClient } from "@/lib/gcp";
import { getPool } from "@/lib/db/pool";

const MAX_FILES = 500;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/staging/import
 *
 * フォームデータ:
 *   - input_location_code: 保管場所コード (tier-box-col, 例: 1-2-3)
 *   - files: 画像ファイル (複数, 最大 500 件)
 *
 * 処理フロー:
 *   1. GCS へ画像をアップロード
 *   2. ocr_jobs テーブルへ INSERT
 *   3. Cloud Tasks へエンキュー（非同期 OCR）
 *
 * OCR は Cloud Tasks ワーカー（/api/ocr/process-job）が非同期で実行する。
 */
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

  const ALLOWED_EXTS  = new Set(["jpg", "jpeg", "png", "webp", "heic"]);
  const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { message: `ファイルサイズ上限（5MB）を超えています: ${file.name}` },
        { status: 400 }
      );
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXTS.has(ext)) {
      return NextResponse.json(
        { message: `対応していないファイル形式です: ${file.name}（jpg / png / webp / heic のみ）` },
        { status: 400 }
      );
    }
    if (file.type && !ALLOWED_MIMES.has(file.type)) {
      return NextResponse.json(
        { message: `対応していない MIME タイプです: ${file.name}` },
        { status: 400 }
      );
    }
  }

  const bucketName     = getRequiredEnv("GCS_BUCKET");
  const project        = getRequiredEnv("GOOGLE_CLOUD_PROJECT");
  const queueLocation  = getRequiredEnv("CLOUD_TASKS_LOCATION");
  const queueName      = getRequiredEnv("CLOUD_TASKS_QUEUE");
  const workerUrl      = getRequiredEnv("CLOUD_TASKS_WORKER_URL");
  const taskSa         = process.env.CLOUD_TASKS_SERVICE_ACCOUNT_EMAIL?.trim();
  const workerSecret   = process.env.OCR_WORKER_SHARED_SECRET?.trim();

  const storage = getStorageClient();
  const bucket  = storage.bucket(bucketName);
  const pool    = getPool();
  const batchId = `batch_${Date.now().toString(36)}`;
  const jobIds: string[] = [];

  // GCS 保存 + ocr_jobs INSERT
  for (const file of files) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const ext   = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
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

  // Cloud Tasks エンキュー（1 ジョブ = 1 タスク = 非同期 OCR）
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
