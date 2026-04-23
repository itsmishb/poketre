import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getPool } from "@/lib/db/pool";
import { getShopifySettings } from "./settings";
import { enqueueJob } from "./jobs";

export function verifyHmac(rawBody: Buffer, headerHmac: string | null, secret: string): boolean {
  if (!headerHmac) return false;
  const computed = createHmac("sha256", secret).update(rawBody).digest("base64");
  const a = Buffer.from(computed);
  const b = Buffer.from(headerHmac);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type ReceiveResult =
  | { ok: true; duplicate: boolean; eventId: string }
  | { ok: false; status: number; error: string };

export async function receiveWebhook(
  topic: string,
  rawBody: Buffer,
  headers: {
    hmac: string | null;
    eventId: string | null;
    shopDomain: string | null;
  }
): Promise<ReceiveResult> {
  const settings = await getShopifySettings();
  if (!settings.webhookSecret) {
    return { ok: false, status: 412, error: "webhook_secret not configured" };
  }
  if (!verifyHmac(rawBody, headers.hmac, settings.webhookSecret)) {
    return { ok: false, status: 401, error: "HMAC verification failed" };
  }

  const payload = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  const eventId =
    headers.eventId ??
    `${topic}:${(payload as { id?: number | string }).id ?? "noid"}:${(payload as { updated_at?: string }).updated_at ?? Date.now()}`;

  const pool = getPool();
  const ins = await pool.query<{ event_id: string }>(
    `INSERT INTO shopify_webhook_events (event_id, topic, shop_domain, payload, process_status)
     VALUES ($1, $2, $3, $4::jsonb, 'RECEIVED')
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [eventId, topic, headers.shopDomain, JSON.stringify(payload)]
  );

  if (ins.rows.length === 0) {
    return { ok: true, duplicate: true, eventId };
  }

  try {
    await dispatchTopic(topic, payload);
    await pool.query(
      `UPDATE shopify_webhook_events
         SET process_status = 'PROCESSED', processed_at = now()
       WHERE event_id = $1`,
      [eventId]
    );
    return { ok: true, duplicate: false, eventId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE shopify_webhook_events
         SET process_status = 'FAILED', processed_at = now(), last_error = $2
       WHERE event_id = $1`,
      [eventId, msg]
    );
    return { ok: false, status: 500, error: msg };
  }
}

async function dispatchTopic(topic: string, payload: Record<string, unknown>): Promise<void> {
  switch (topic) {
    case "orders/create":
    case "orders/updated":
    case "orders/paid":
      await handleOrder(topic, payload);
      return;
    case "inventory_levels/update":
      // Shopify 側からの在庫変動通知。現状は監査ログに留める
      return;
    default:
      // 未対応 topic は受信のみで成功扱い
      return;
  }
}

export type ShopifyOrder = {
  id: number;
  name?: string;
  financial_status?: string;
  currency?: string;
  total_price?: string;
  created_at?: string;
  line_items?: Array<{
    id: number;
    variant_id: number | null;
    quantity: number;
    price: string;
    sku?: string;
    title?: string;
  }>;
};

export async function handleOrder(topic: string, payload: Record<string, unknown>): Promise<void> {
  const order = payload as ShopifyOrder;
  if (!order.id) throw new Error("order.id missing");
  const pool = getPool();

  const orderRes = await pool.query<{ order_id: number }>(
    `INSERT INTO orders (channel, external_order_id, order_status, currency, total_price, ordered_at, raw)
     VALUES ('SHOPIFY', $1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (channel, external_order_id) DO UPDATE SET
       order_status = EXCLUDED.order_status,
       total_price = EXCLUDED.total_price,
       raw = EXCLUDED.raw,
       updated_at = now()
     RETURNING order_id`,
    [
      String(order.id),
      order.financial_status ?? null,
      order.currency ?? "JPY",
      order.total_price ?? null,
      order.created_at ?? null,
      JSON.stringify(order),
    ]
  );
  const orderId = orderRes.rows[0].order_id;

  const lines = order.line_items ?? [];
  if (lines.length === 0) return;

  for (const li of lines) {
    let cardId: string | null = null;
    if (li.variant_id) {
      const { rows } = await pool.query<{ card_id: string }>(
        `SELECT card_id FROM shopify_products WHERE shopify_variant_id = $1`,
        [li.variant_id.toString()]
      );
      cardId = rows[0]?.card_id ?? null;
    }

    // 冪等: (order_id, shopify_line_item_id) UNIQUE で重複 INSERT を防ぐ
    await pool.query(
      `INSERT INTO order_lines (order_id, shopify_line_item_id, card_id, qty, unit_price, shopify_variant_id, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (order_id, shopify_line_item_id) WHERE shopify_line_item_id IS NOT NULL
       DO UPDATE SET
         card_id = EXCLUDED.card_id,
         qty = EXCLUDED.qty,
         unit_price = EXCLUDED.unit_price,
         shopify_variant_id = EXCLUDED.shopify_variant_id,
         raw = EXCLUDED.raw`,
      [
        orderId,
        li.id,
        cardId,
        li.quantity,
        li.price ?? null,
        li.variant_id?.toString() ?? null,
        JSON.stringify(li),
      ]
    );

    if (!cardId) continue;

    // stock_movements: OUT
    // 部分 UNIQUE INDEX (ref_kind='ORDER', ref_id, metadata->>'line_id') で
    // どの topic（create/paid/updated）から来ても二重計上しない
    const inserted = await pool.query<{ movement_id: string }>(
      `INSERT INTO stock_movements
         (target_type, target_id, card_id, qty_delta, movement_type, ref_kind, ref_id, notes, metadata)
       SELECT 'LOT', inventory_lot_id, $1, -$2, 'OUT', 'ORDER', $3,
              'Shopify order ' || $4, $5::jsonb
         FROM inventory_lots
        WHERE card_id = $1 AND status = 'IN_STOCK'
        ORDER BY created_at ASC
        LIMIT 1
       ON CONFLICT (ref_kind, ref_id, ((metadata->>'line_id'))) WHERE ref_kind = 'ORDER' AND metadata ? 'line_id'
       DO NOTHING
       RETURNING movement_id`,
      [cardId, li.quantity, String(order.id), order.name ?? String(order.id), JSON.stringify({ line_id: li.id })]
    );

    // 新規 OUT が記録されたときだけ Shopify 在庫数を再同期
    if (inserted.rowCount && inserted.rowCount > 0) {
      await enqueueJob("UPDATE_INVENTORY", cardId, { reason: "order_consumed", order_id: order.id });
    }
  }
}
