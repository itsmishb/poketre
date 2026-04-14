import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { isDatabaseConfigured } from "@/lib/server-data";
import { requireOperatorOrAdminUser } from "@/lib/authz";

/** バッチID の期待フォーマット: batch_ + 英数字 */
const BATCH_ID_RE = /^batch_[a-z0-9]+$/;

/**
 * GET /api/staging/batch-status?batch_ids=batch_xxx,batch_yyy
 *
 * 複数バッチの OCR 進捗を返す。フロントエンドのポーリングに使用。
 *
 * クエリパラメータ:
 *   - batch_ids: カンマ区切りのバッチID（最大 20 件）
 *   - batch_id:  単一バッチID（batch_ids の別名）
 *
 * レスポンス:
 *   {
 *     batches: Array<{
 *       batch_id: string,
 *       total: number,
 *       queued: number,
 *       running: number,
 *       succeeded: number,
 *       failed: number,
 *       completed: boolean,
 *     }>
 *   }
 */
export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ batches: [] });
  }

  const authz = await requireOperatorOrAdminUser();
  if (!authz.ok) {
    return NextResponse.json({ message: authz.message }, { status: authz.status });
  }

  const { searchParams } = new URL(request.url);
  const batchIdsParam = searchParams.get("batch_ids") ?? searchParams.get("batch_id");
  if (!batchIdsParam) {
    return NextResponse.json({ error: "batch_ids required" }, { status: 400 });
  }

  // フォーマット検証付きでパース
  const batchIds = batchIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter((id) => BATCH_ID_RE.test(id))
    .slice(0, 20);

  if (batchIds.length === 0) {
    return NextResponse.json({ error: "No valid batch_ids provided" }, { status: 400 });
  }

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
       COUNT(*)                                        AS total,
       COUNT(*) FILTER (WHERE status = 'QUEUED')       AS queued,
       COUNT(*) FILTER (WHERE status = 'RUNNING')      AS running,
       COUNT(*) FILTER (WHERE status = 'SUCCEEDED')    AS succeeded,
       COUNT(*) FILTER (WHERE status = 'FAILED')       AS failed
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
