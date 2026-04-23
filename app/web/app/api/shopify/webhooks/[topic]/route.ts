import { NextResponse } from "next/server";
import { receiveWebhook } from "@/lib/shopify/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/shopify/webhooks/[topic]
 * topic は "orders.create" 形式（Shopify は orders/create を URL では . に置換するのが通例）。
 * HMAC 検証は raw body 必須なので Buffer で読む。
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ topic: string }> }
) {
  const { topic: rawTopic } = await params;
  const topic = rawTopic.replace(/\./g, "/").replace(/-/g, "_");

  const arrayBuffer = await req.arrayBuffer();
  const rawBody = Buffer.from(arrayBuffer);

  const result = await receiveWebhook(topic, rawBody, {
    hmac: req.headers.get("x-shopify-hmac-sha256"),
    // Shopify 公式の正規ヘッダは X-Shopify-Webhook-Id。X-Shopify-Event-Id は古い別名。
    eventId: req.headers.get("x-shopify-webhook-id") ?? req.headers.get("x-shopify-event-id"),
    shopDomain: req.headers.get("x-shopify-shop-domain"),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, duplicate: result.duplicate, eventId: result.eventId });
}
