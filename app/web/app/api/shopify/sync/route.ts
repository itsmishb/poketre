import { NextResponse } from "next/server";
import { requireOperatorOrAdminUser } from "@/lib/authz";
import { getPool } from "@/lib/db/pool";
import { enqueueJob, type JobType } from "@/lib/shopify/jobs";

/**
 * POST /api/shopify/sync
 * body: { cardIds?: string[]; jobType?: 'UPSERT_PRODUCT' | 'UPDATE_INVENTORY'; all?: boolean }
 * cardIds 未指定 + all=true で API_SYNC な listings を一括キュー
 */
export async function POST(req: Request) {
  const auth = await requireOperatorOrAdminUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as {
    cardIds?: string[];
    jobType?: JobType;
    all?: boolean;
  };
  const jobType: JobType = body.jobType ?? "UPSERT_PRODUCT";

  let cardIds: string[] = body.cardIds ?? [];
  if (cardIds.length === 0 && body.all) {
    const pool = getPool();
    const { rows } = await pool.query<{ card_id: string }>(
      `SELECT DISTINCT card_id FROM listings
        WHERE channel = 'SHOPIFY' AND listing_mode = 'API_SYNC'`
    );
    cardIds = rows.map((r) => r.card_id);
  }

  if (cardIds.length === 0) {
    return NextResponse.json({ ok: true, queued: 0, jobIds: [] });
  }

  const jobIds: number[] = [];
  for (const cardId of cardIds) {
    jobIds.push(await enqueueJob(jobType, cardId, { source: "manual_sync" }));
  }
  return NextResponse.json({ ok: true, queued: jobIds.length, jobIds });
}
