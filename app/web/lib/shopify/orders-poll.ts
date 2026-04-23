import "server-only";
import { getPool } from "@/lib/db/pool";
import { getShopifyClient } from "./client";
import { handleOrder, type ShopifyOrder } from "./webhooks";

/**
 * Webhook 取りこぼし救済用の注文ポーリング。
 * since 未指定の場合は shopify_settings.last_order_poll_at を起点に（初回は24時間前）。
 * 取り込んだ注文は handleOrder に委譲し、event_id = `poll:order:<id>:<updated_at>` で冪等化。
 */
export async function importOrdersSince(since?: Date): Promise<{
  imported: number;
  skipped: number;
  latestUpdatedAt: Date | null;
}> {
  const pool = getPool();
  const client = await getShopifyClient();

  let startFrom = since ?? null;
  if (!startFrom) {
    const { rows } = await pool.query<{ last_order_poll_at: Date | null }>(
      `SELECT last_order_poll_at FROM shopify_settings WHERE id = 1`
    );
    startFrom = rows[0]?.last_order_poll_at ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  }

  // 5分戻して境界の取りこぼしを防ぐ
  const queryFrom = new Date(startFrom.getTime() - 5 * 60 * 1000);
  const isoFrom = queryFrom.toISOString();

  let cursor: string | null = null;
  let imported = 0;
  let skipped = 0;
  let latestUpdatedAt: Date | null = null;

  while (true) {
    const data: {
      orders: {
        edges: Array<{ cursor: string; node: OrderNode }>;
        pageInfo: { hasNextPage: boolean };
      };
    } = await client.graphql(
      `query polOrders($query: String!, $after: String) {
         orders(first: 50, after: $after, sortKey: UPDATED_AT, query: $query) {
           edges {
             cursor
             node {
               id
               name
               displayFinancialStatus
               currencyCode
               totalPriceSet { shopMoney { amount } }
               createdAt
               updatedAt
               lineItems(first: 100) {
                 edges {
                   node {
                     id
                     quantity
                     originalUnitPriceSet { shopMoney { amount } }
                     sku
                     title
                     variant { id }
                   }
                 }
               }
             }
           }
           pageInfo { hasNextPage }
         }
       }`,
      { query: `updated_at:>='${isoFrom}'`, after: cursor }
    );

    for (const edge of data.orders.edges) {
      const node = edge.node;
      const order = toShopifyOrder(node);
      const updatedAt = new Date(node.updatedAt);
      const eventId = `poll:order:${order.id}:${node.updatedAt}`;

      // 冪等: shopify_webhook_events に INSERT ON CONFLICT DO NOTHING
      const ins = await pool.query<{ event_id: string }>(
        `INSERT INTO shopify_webhook_events (event_id, topic, shop_domain, payload, process_status)
         VALUES ($1, 'orders/poll', NULL, $2::jsonb, 'RECEIVED')
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [eventId, JSON.stringify(order)]
      );

      if (ins.rows.length === 0) {
        skipped++;
        continue;
      }

      try {
        // ポーリング経由では orders/create 扱いで stock_movements に反映
        await handleOrder("orders/create", order as unknown as Record<string, unknown>);
        await pool.query(
          `UPDATE shopify_webhook_events
             SET process_status = 'PROCESSED', processed_at = now()
           WHERE event_id = $1`,
          [eventId]
        );
        imported++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await pool.query(
          `UPDATE shopify_webhook_events
             SET process_status = 'FAILED', processed_at = now(), last_error = $2
           WHERE event_id = $1`,
          [eventId, msg]
        );
      }

      if (!latestUpdatedAt || updatedAt > latestUpdatedAt) {
        latestUpdatedAt = updatedAt;
      }
    }

    if (!data.orders.pageInfo.hasNextPage) break;
    cursor = data.orders.edges[data.orders.edges.length - 1]?.cursor ?? null;
    if (!cursor) break;
  }

  await pool.query(
    `UPDATE shopify_settings SET last_order_poll_at = $1, updated_at = now() WHERE id = 1`,
    [latestUpdatedAt ?? new Date()]
  );

  return { imported, skipped, latestUpdatedAt };
}

type OrderNode = {
  id: string;
  name: string;
  displayFinancialStatus: string | null;
  currencyCode: string;
  totalPriceSet: { shopMoney: { amount: string } };
  createdAt: string;
  updatedAt: string;
  lineItems: {
    edges: Array<{
      node: {
        id: string;
        quantity: number;
        originalUnitPriceSet: { shopMoney: { amount: string } };
        sku: string | null;
        title: string | null;
        variant: { id: string } | null;
      };
    }>;
  };
};

function toShopifyOrder(node: OrderNode): ShopifyOrder {
  return {
    id: Number(node.id.replace(/^gid:\/\/shopify\/Order\//, "")),
    name: node.name,
    financial_status: node.displayFinancialStatus?.toLowerCase() ?? undefined,
    currency: node.currencyCode,
    total_price: node.totalPriceSet.shopMoney.amount,
    created_at: node.createdAt,
    line_items: node.lineItems.edges.map((e) => ({
      id: Number(e.node.id.replace(/^gid:\/\/shopify\/LineItem\//, "")),
      variant_id: e.node.variant?.id
        ? Number(e.node.variant.id.replace(/^gid:\/\/shopify\/ProductVariant\//, ""))
        : null,
      quantity: e.node.quantity,
      price: e.node.originalUnitPriceSet.shopMoney.amount,
      sku: e.node.sku ?? undefined,
      title: e.node.title ?? undefined,
    })),
  };
}
