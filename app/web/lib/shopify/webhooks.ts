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
    case "orders/cancelled":
      await handleOrderCancelled(payload);
      return;
    case "refunds/create":
      await handleRefundCreated(payload);
      return;
    case "inventory_levels/update":
      // Shopify 側からの在庫変動通知。現状は監査ログに留める
      return;
    default:
      // 未対応 topic は受信のみで成功扱い。新 topic 対応漏れに気付くためログ。
      console.warn(`[shopify-webhook] unhandled topic: ${topic}`);
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

export type ShopifyRefund = {
  id: number;
  order_id: number;
  created_at?: string;
  refund_line_items?: Array<{
    id: number;
    line_item_id: number;
    quantity: number;
  }>;
};

export async function handleOrder(_topic: string, payload: Record<string, unknown>): Promise<void> {
  const order = payload as ShopifyOrder;
  if (!order.id) throw new Error("order.id missing");
  const pool = getPool();
  const lines = order.line_items ?? [];

  // batched variant_id → card_id lookup (#24B: N+1 解消)
  const variantIds = Array.from(
    new Set(lines.map((li) => li.variant_id).filter((v): v is number => typeof v === "number"))
  );
  const variantToCard = new Map<string, string>();
  if (variantIds.length > 0) {
    const { rows } = await pool.query<{ shopify_variant_id: string; card_id: string }>(
      `SELECT shopify_variant_id, card_id
         FROM shopify_products
        WHERE shopify_variant_id = ANY($1::text[])`,
      [variantIds.map((v) => v.toString())]
    );
    for (const r of rows) variantToCard.set(r.shopify_variant_id, r.card_id);
  }

  const touchedCardIds = new Set<string>();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderRes = await client.query<{ order_id: number }>(
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

    for (const li of lines) {
      const cardId = li.variant_id ? variantToCard.get(li.variant_id.toString()) ?? null : null;

      // 冪等: (order_id, shopify_line_item_id) UNIQUE で重複 INSERT を防ぐ
      await client.query(
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

      // #24A: SELECT ... FOR UPDATE SKIP LOCKED で在庫ロットを取り、
      //       同時注文で同一ロットを二重引当しないようにする。
      // INSERT ... SELECT 内では FOR UPDATE が書けないため CTE に分離。
      // ON CONFLICT で同一 (ORDER, order_id, line_id) は二重計上を防ぐ。
      await client.query(
        `WITH picked AS (
           SELECT inventory_lot_id
             FROM inventory_lots
            WHERE card_id = $1 AND status = 'IN_STOCK'
            ORDER BY created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
         )
         INSERT INTO stock_movements
           (target_type, target_id, card_id, qty_delta, movement_type, ref_kind, ref_id, notes, metadata)
         SELECT 'LOT', inventory_lot_id, $1, -$2, 'OUT', 'ORDER', $3,
                'Shopify order ' || $4, $5::jsonb
           FROM picked
         ON CONFLICT (ref_kind, ref_id, ((metadata->>'line_id')))
           WHERE ref_kind = 'ORDER' AND metadata ? 'line_id'
         DO NOTHING`,
        [cardId, li.quantity, String(order.id), order.name ?? String(order.id), JSON.stringify({ line_id: li.id })]
      );

      // #25: insert 成否に関わらず、line_item に紐づく card は必ず再同期対象とする。
      // (二重 webhook で 2 回目が ON CONFLICT になっても UPDATE_INVENTORY が漏れないようにする。
      //  UPDATE_INVENTORY 自体はべき等なので多少の無駄同期は許容する。)
      touchedCardIds.add(cardId);
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  // ジョブ enqueue は COMMIT 後 (失敗時に孤児ジョブが残らないように)
  for (const cardId of touchedCardIds) {
    await enqueueJob("UPDATE_INVENTORY", cardId, { reason: "order_consumed", order_id: order.id });
  }
}

export async function handleOrderCancelled(payload: Record<string, unknown>): Promise<void> {
  const order = payload as ShopifyOrder;
  if (!order.id) throw new Error("order.id missing");
  await reverseOrderMovements({
    refId: String(order.id),
    refKind: "CANCEL",
    metadataExtra: {},
    notesPrefix: `Shopify order cancelled ${order.name ?? order.id}`,
  });
}

export async function handleRefundCreated(payload: Record<string, unknown>): Promise<void> {
  const refund = payload as ShopifyRefund;
  if (!refund.id || !refund.order_id) throw new Error("refund.id/order_id missing");
  const items = refund.refund_line_items ?? [];
  if (items.length === 0) return;

  const pool = getPool();
  const touchedCardIds = new Set<string>();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const ri of items) {
      // 元の OUT 行から card_id / lot を取得
      const { rows } = await client.query<{
        card_id: string;
        target_type: string;
        target_id: string;
      }>(
        `SELECT card_id, target_type, target_id
           FROM stock_movements
          WHERE ref_kind = 'ORDER'
            AND ref_id = $1
            AND metadata->>'line_id' = $2
          ORDER BY moved_at ASC
          LIMIT 1`,
        [String(refund.order_id), String(ri.line_item_id)]
      );
      const src = rows[0];
      if (!src) continue;

      await client.query(
        `INSERT INTO stock_movements
           (target_type, target_id, card_id, qty_delta, movement_type, ref_kind, ref_id, notes, metadata)
         VALUES ($1, $2, $3, $4, 'IN', 'REFUND', $5, $6, $7::jsonb)
         ON CONFLICT (ref_kind, ref_id, ((metadata->>'line_id')), ((metadata->>'refund_id')))
           WHERE ref_kind = 'REFUND' AND metadata ? 'line_id' AND metadata ? 'refund_id'
         DO NOTHING`,
        [
          src.target_type,
          src.target_id,
          src.card_id,
          ri.quantity,
          String(refund.order_id),
          `Shopify refund ${refund.id}`,
          JSON.stringify({ line_id: ri.line_item_id, refund_id: refund.id }),
        ]
      );
      touchedCardIds.add(src.card_id);
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  for (const cardId of touchedCardIds) {
    await enqueueJob("UPDATE_INVENTORY", cardId, {
      reason: "refund_restored",
      order_id: refund.order_id,
      refund_id: refund.id,
    });
  }
}

// 共通: 元の OUT 行を反転する IN 行を全 line に対して INSERT (キャンセル用)
async function reverseOrderMovements(args: {
  refId: string;
  refKind: "CANCEL";
  metadataExtra: Record<string, unknown>;
  notesPrefix: string;
}): Promise<void> {
  const pool = getPool();
  const touchedCardIds = new Set<string>();

  // 元 OUT 行を取得
  const { rows: outs } = await pool.query<{
    card_id: string;
    target_type: string;
    target_id: string;
    qty_delta: number;
    line_id: string;
  }>(
    `SELECT card_id, target_type, target_id, qty_delta, metadata->>'line_id' AS line_id
       FROM stock_movements
      WHERE ref_kind = 'ORDER'
        AND ref_id = $1
        AND metadata ? 'line_id'`,
    [args.refId]
  );
  if (outs.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const o of outs) {
      const meta = { ...args.metadataExtra, line_id: o.line_id };
      await client.query(
        `INSERT INTO stock_movements
           (target_type, target_id, card_id, qty_delta, movement_type, ref_kind, ref_id, notes, metadata)
         VALUES ($1, $2, $3, $4, 'IN', $5, $6, $7, $8::jsonb)
         ON CONFLICT (ref_kind, ref_id, ((metadata->>'line_id')))
           WHERE ref_kind = 'CANCEL' AND metadata ? 'line_id'
         DO NOTHING`,
        [
          o.target_type,
          o.target_id,
          o.card_id,
          Math.abs(o.qty_delta),
          args.refKind,
          args.refId,
          args.notesPrefix,
          JSON.stringify(meta),
        ]
      );
      touchedCardIds.add(o.card_id);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  for (const cardId of touchedCardIds) {
    await enqueueJob("UPDATE_INVENTORY", cardId, {
      reason: "order_cancelled",
      order_id: args.refId,
    });
  }
}
