import "server-only";
import { getPool } from "@/lib/db/pool";
import {
  getShopifyClient,
  gidToId,
  productGid,
  variantGid,
  inventoryItemGid,
  locationGid,
  type ShopifyClient,
} from "./client";
import { getShopifySettings } from "./settings";

type ListingRow = {
  listing_id: string;
  card_id: string;
  list_qty: number;
  reserved_qty: number;
  price: string | null;
  listing_title: string | null;
  listing_description: string | null;
  status: string;
};

type CardRow = {
  card_id: string;
  name_ja: string;
  set_code: string;
  rarity: string | null;
  public_description_ja: string | null;
};

type ShopifyProductRow = {
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  shopify_inventory_item_id: string | null;
};

/**
 * Phase A: 1 card_id = 1 product = 1 variant.
 * 在庫数: 在庫可能数 (inventory_units IN_STOCK + lots qty_on_hand) - reserved_qty を clamp(0..)
 */
export async function upsertProduct(cardId: string): Promise<void> {
  const pool = getPool();
  const client = await getShopifyClient();
  const settings = await getShopifySettings();
  if (!settings.locationId) {
    throw new Error("location_id が未設定です。設定画面で Shopify ロケーションを指定してください。");
  }

  const { rows: cardRows } = await pool.query<CardRow>(
    `SELECT card_id, name_ja, set_code, rarity, public_description_ja
       FROM cards WHERE card_id = $1`,
    [cardId]
  );
  if (cardRows.length === 0) throw new Error(`card not found: ${cardId}`);
  const card = cardRows[0];

  const { rows: listingRows } = await pool.query<ListingRow>(
    `SELECT listing_id, card_id, list_qty, reserved_qty, price,
            listing_title, listing_description, status
       FROM listings
      WHERE card_id = $1 AND channel = 'SHOPIFY' AND listing_mode = 'API_SYNC'
      ORDER BY updated_at DESC
      LIMIT 1`,
    [cardId]
  );
  const listing = listingRows[0] ?? null;

  const { rows: existingRows } = await pool.query<ShopifyProductRow>(
    `SELECT shopify_product_id, shopify_variant_id, shopify_inventory_item_id
       FROM shopify_products WHERE card_id = $1`,
    [cardId]
  );
  const existing = existingRows[0] ?? null;

  const title = listing?.listing_title ?? card.name_ja;
  const description = listing?.listing_description ?? card.public_description_ja ?? "";
  const price = listing?.price ?? null;
  const status = mapStatus(listing?.status ?? "DRAFT");
  const sku = `${card.set_code}-${card.card_id}`;

  let productId: bigint;
  let variantId: bigint;
  let inventoryItemId: bigint;

  if (existing?.shopify_product_id && existing.shopify_variant_id) {
    productId = BigInt(existing.shopify_product_id);
    variantId = BigInt(existing.shopify_variant_id);
    inventoryItemId = await updateProduct(client, productId, variantId, {
      title,
      description,
      price,
      status,
      sku,
    });
  } else {
    const created = await createProduct(client, {
      title,
      description,
      price,
      status,
      sku,
    });
    productId = created.productId;
    variantId = created.variantId;
    inventoryItemId = created.inventoryItemId;
  }

  // location に対する InventoryItem の有効化
  await activateInventoryItem(client, inventoryItemId, settings.locationId);

  // 在庫数を計算して反映
  const available = await computeAvailable(cardId);
  await setInventory(client, inventoryItemId, settings.locationId, available);

  await pool.query(
    `INSERT INTO shopify_products
       (card_id, shopify_product_id, shopify_variant_id, shopify_inventory_item_id,
        shopify_location_id, sync_status, last_synced_at, last_error, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'SYNCED', now(), NULL, now())
     ON CONFLICT (card_id) DO UPDATE SET
       shopify_product_id = EXCLUDED.shopify_product_id,
       shopify_variant_id = EXCLUDED.shopify_variant_id,
       shopify_inventory_item_id = EXCLUDED.shopify_inventory_item_id,
       shopify_location_id = EXCLUDED.shopify_location_id,
       sync_status = 'SYNCED',
       last_synced_at = now(),
       last_error = NULL,
       updated_at = now()`,
    [
      cardId,
      productId.toString(),
      variantId.toString(),
      inventoryItemId.toString(),
      settings.locationId.toString(),
    ]
  );

  if (listing) {
    await pool.query(
      `UPDATE listings
         SET sync_status = 'SYNCED', sync_error_message = NULL, sync_at = now(),
             external_listing_id = $1, updated_at = now()
       WHERE listing_id = $2`,
      [productId.toString(), listing.listing_id]
    );
  }
}

export async function updateInventoryOnly(cardId: string): Promise<void> {
  const pool = getPool();
  const client = await getShopifyClient();
  const settings = await getShopifySettings();
  if (!settings.locationId) throw new Error("location_id が未設定です。");

  const { rows } = await pool.query<{ shopify_inventory_item_id: string | null }>(
    `SELECT shopify_inventory_item_id FROM shopify_products WHERE card_id = $1`,
    [cardId]
  );
  const itemId = rows[0]?.shopify_inventory_item_id;
  if (!itemId) {
    // 未同期 → product upsert を回す
    await upsertProduct(cardId);
    return;
  }

  // #27: 同一 cardId に対する updateInventoryOnly を直列化する。
  // pg_advisory_xact_lock を 1 接続上で取り、computeAvailable → setInventory までを
  // 同じ接続のトランザクション内で実行する。これで「読み取り → 送信」の間に
  // 別の UPDATE_INVENTORY ジョブが値を上書きする競合は防げる。
  // (webhooks の OUT 側はこのロックを取らないが、各 OUT は必ず UPDATE_INVENTORY を
  //  enqueue する (#25) ため、結果整合で Shopify 側に最新値が反映される。)
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    await conn.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`shopify:update_inventory:${cardId}`]);

    const availRes = await conn.query<{ available: string }>(
      `SELECT
         COALESCE((SELECT COUNT(*) FROM inventory_units WHERE card_id = $1 AND status = 'IN_STOCK'), 0)
       + COALESCE((SELECT SUM(qty_on_hand) FROM inventory_lots WHERE card_id = $1 AND status = 'IN_STOCK'), 0)
       - COALESCE((SELECT SUM(reserved_qty) FROM listings WHERE card_id = $1 AND status IN ('LISTED', 'RESERVED')), 0)
         AS available`,
      [cardId]
    );
    const available = Math.max(0, Number(availRes.rows[0]?.available ?? 0));

    await setInventory(client, BigInt(itemId), settings.locationId, available);

    await conn.query(
      `UPDATE shopify_products SET last_synced_at = now(), sync_status = 'SYNCED', updated_at = now() WHERE card_id = $1`,
      [cardId]
    );
    await conn.query("COMMIT");
  } catch (e) {
    await conn.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

export async function unpublishProduct(cardId: string): Promise<void> {
  const pool = getPool();
  const client = await getShopifyClient();
  const { rows } = await pool.query<{ shopify_product_id: string | null }>(
    `SELECT shopify_product_id FROM shopify_products WHERE card_id = $1`,
    [cardId]
  );
  const pid = rows[0]?.shopify_product_id;
  if (!pid) return;
  await client.graphql(
    `mutation update($input: ProductInput!) {
       productUpdate(input: $input) { product { id } userErrors { field message } }
     }`,
    { input: { id: productGid(pid), status: "DRAFT" } }
  );
  await pool.query(
    `UPDATE shopify_products SET sync_status = 'UNPUBLISHED', last_synced_at = now(), updated_at = now() WHERE card_id = $1`,
    [cardId]
  );
}

// ---------------------------------------------------------------------------

type ProductFields = {
  title: string;
  description: string;
  price: string | null;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  sku: string;
};

type CreateResult = { productId: bigint; variantId: bigint; inventoryItemId: bigint };

// Shopify Admin API 2024-04+ では productCreate に variants 入力が削除された。
// (1) productCreate で本体 + デフォルトバリアントを作成
// (2) productVariantsBulkUpdate でデフォルトバリアントの price/sku/inventory を設定
async function createProduct(client: ShopifyClient, f: ProductFields): Promise<CreateResult> {
  const created = await client.graphql<{
    productCreate: {
      product: {
        id: string;
        variants: { edges: Array<{ node: { id: string; inventoryItem: { id: string } } }> };
      } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(
    `mutation create($input: ProductInput!) {
       productCreate(input: $input) {
         product {
           id
           variants(first: 1) {
             edges { node { id inventoryItem { id } } }
           }
         }
         userErrors { field message }
       }
     }`,
    {
      input: {
        title: f.title,
        descriptionHtml: f.description,
        status: f.status,
      },
    }
  );

  const errs = created.productCreate.userErrors;
  if (errs.length > 0) {
    throw new Error(`productCreate userErrors: ${errs.map((e) => `${e.field?.join(".")} ${e.message}`).join("; ")}`);
  }
  const product = created.productCreate.product;
  if (!product) throw new Error("productCreate returned null product");
  const defaultVariant = product.variants.edges[0]?.node;
  if (!defaultVariant) throw new Error("productCreate returned no default variant");

  const productId = gidToId(product.id);
  const variantId = gidToId(defaultVariant.id);
  const inventoryItemId = gidToId(defaultVariant.inventoryItem.id);

  await bulkUpdateVariant(client, productId, variantId, f);

  return { productId, variantId, inventoryItemId };
}

async function updateProduct(
  client: ShopifyClient,
  productId: bigint,
  variantId: bigint,
  f: ProductFields
): Promise<bigint> {
  const updated = await client.graphql<{
    productUpdate: {
      product: { id: string; variants: { edges: Array<{ node: { id: string; inventoryItem: { id: string } } }> } } | null;
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(
    `mutation update($input: ProductInput!) {
       productUpdate(input: $input) {
         product {
           id
           variants(first: 1) {
             edges { node { id inventoryItem { id } } }
           }
         }
         userErrors { field message }
       }
     }`,
    {
      input: {
        id: productGid(productId),
        title: f.title,
        descriptionHtml: f.description,
        status: f.status,
      },
    }
  );
  const errs = updated.productUpdate.userErrors;
  if (errs.length > 0) {
    throw new Error(`productUpdate userErrors: ${errs.map((e) => e.message).join("; ")}`);
  }
  const variant = updated.productUpdate.product?.variants.edges[0]?.node;
  if (!variant) throw new Error("productUpdate returned no variant");

  await bulkUpdateVariant(client, productId, variantId, f);

  return gidToId(variant.inventoryItem.id);
}

async function bulkUpdateVariant(
  client: ShopifyClient,
  productId: bigint,
  variantId: bigint,
  f: ProductFields
): Promise<void> {
  const data = await client.graphql<{
    productVariantsBulkUpdate: {
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(
    `mutation bulk($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
       productVariantsBulkUpdate(productId: $productId, variants: $variants) {
         userErrors { field message }
       }
     }`,
    {
      productId: productGid(productId),
      variants: [
        {
          id: variantGid(variantId),
          price: f.price ?? "0",
          inventoryItem: { sku: f.sku, tracked: true },
        },
      ],
    }
  );
  const errs = data.productVariantsBulkUpdate.userErrors;
  if (errs.length > 0) {
    throw new Error(`productVariantsBulkUpdate userErrors: ${errs.map((e) => e.message).join("; ")}`);
  }
}

async function activateInventoryItem(
  client: ShopifyClient,
  inventoryItemId: bigint,
  locationId: bigint
): Promise<void> {
  await client.graphql(
    `mutation activate($inventoryItemId: ID!, $locationId: ID!) {
       inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
         inventoryLevel { id }
         userErrors { field message }
       }
     }`,
    { inventoryItemId: inventoryItemGid(inventoryItemId), locationId: locationGid(locationId) }
  );
}

async function setInventory(
  client: ShopifyClient,
  inventoryItemId: bigint,
  locationId: bigint,
  available: number
): Promise<void> {
  const data = await client.graphql<{
    inventorySetOnHandQuantities: {
      userErrors: Array<{ field: string[]; message: string }>;
    };
  }>(
    `mutation setOnHand($input: InventorySetOnHandQuantitiesInput!) {
       inventorySetOnHandQuantities(input: $input) {
         userErrors { field message }
       }
     }`,
    {
      input: {
        reason: "correction",
        setQuantities: [
          {
            inventoryItemId: inventoryItemGid(inventoryItemId),
            locationId: locationGid(locationId),
            quantity: Math.max(0, available),
          },
        ],
      },
    }
  );
  const errs = data.inventorySetOnHandQuantities.userErrors;
  if (errs.length > 0) {
    throw new Error(`setInventory userErrors: ${errs.map((e) => e.message).join("; ")}`);
  }
}

async function computeAvailable(cardId: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ available: string }>(
    `SELECT
       COALESCE((SELECT COUNT(*) FROM inventory_units WHERE card_id = $1 AND status = 'IN_STOCK'), 0)
     + COALESCE((SELECT SUM(qty_on_hand) FROM inventory_lots WHERE card_id = $1 AND status = 'IN_STOCK'), 0)
     - COALESCE((SELECT SUM(reserved_qty) FROM listings WHERE card_id = $1 AND status IN ('LISTED', 'RESERVED')), 0)
       AS available`,
    [cardId]
  );
  return Math.max(0, Number(rows[0]?.available ?? 0));
}

function mapStatus(listingStatus: string): "ACTIVE" | "DRAFT" | "ARCHIVED" {
  switch (listingStatus) {
    case "LISTED":
    case "RESERVED":
      return "ACTIVE";
    case "ENDED":
    case "SOLD":
      return "ARCHIVED";
    default:
      return "DRAFT";
  }
}
