import { NextResponse } from "next/server";
import { requireOperatorOrAdminUser } from "@/lib/authz";
import { enqueueJob } from "@/lib/shopify/jobs";

/**
 * POST /api/shopify/import-orders
 * Webhook 取りこぼし救済用の注文ポーリングをキュー。
 * body: { since?: string (ISO8601) }
 */
export async function POST(req: Request) {
  const auth = await requireOperatorOrAdminUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await req.json().catch(() => ({}))) as { since?: string };
  const payload: Record<string, unknown> = {};
  if (body.since) payload.since = body.since;

  const jobId = await enqueueJob("IMPORT_ORDERS", null, payload);
  return NextResponse.json({ ok: true, jobId });
}
