import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { isDatabaseConfigured } from "@/lib/server-data";
import { requireOperatorOrAdminUser } from "@/lib/authz";

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
  const auth = await requireOperatorOrAdminUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

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
