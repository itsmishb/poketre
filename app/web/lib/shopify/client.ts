import "server-only";
import { getShopifySettings } from "./settings";

export class ShopifyError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly body?: unknown
  ) {
    super(message);
  }
}

type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
  extensions?: Record<string, unknown>;
};

export type ShopifyClient = {
  shopDomain: string;
  apiVersion: string;
  graphql: <T>(query: string, variables?: Record<string, unknown>) => Promise<T>;
  rest: <T>(method: string, path: string, body?: unknown) => Promise<T>;
};

export async function getShopifyClient(): Promise<ShopifyClient> {
  const s = await getShopifySettings();
  if (!s.shopDomain) throw new ShopifyError("Shopify shop_domain is not configured", 412, false);
  if (!s.accessToken) throw new ShopifyError("Shopify access_token is not configured", 412, false);
  return makeClient(s.shopDomain, s.apiVersion, s.accessToken);
}

export function makeClient(
  shopDomain: string,
  apiVersion: string,
  accessToken: string
): ShopifyClient {
  const base = `https://${shopDomain}/admin/api/${apiVersion}`;
  const headers = {
    "X-Shopify-Access-Token": accessToken,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
    let attempt = 0;
    let lastErr: ShopifyError | null = null;
    while (attempt < 5) {
      attempt++;
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      const parsed = text ? safeJson(text) : null;

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("Retry-After"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(2 ** attempt * 250, 8000);
        lastErr = new ShopifyError(
          `Shopify ${res.status}: ${truncate(text)}`,
          res.status,
          true,
          parsed
        );
        await sleep(waitMs);
        continue;
      }
      if (!res.ok) {
        throw new ShopifyError(
          `Shopify ${res.status}: ${truncate(text)}`,
          res.status,
          false,
          parsed
        );
      }
      return parsed as T;
    }
    throw lastErr ?? new ShopifyError("Shopify request failed after retries", 500, true);
  }

  return {
    shopDomain,
    apiVersion,
    async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
      const res = await call<GraphQLResponse<T>>("POST", `${base}/graphql.json`, {
        query,
        variables,
      });
      if (res.errors && res.errors.length > 0) {
        throw new ShopifyError(
          `GraphQL: ${res.errors.map((e) => e.message).join("; ")}`,
          400,
          false,
          res.errors
        );
      }
      if (!res.data) {
        throw new ShopifyError("GraphQL: empty data", 500, true, res);
      }
      return res.data;
    },
    rest<T>(method: string, path: string, body?: unknown): Promise<T> {
      const url = path.startsWith("http") ? path : `${base}${path}`;
      return call<T>(method, url, body);
    },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function truncate(s: string, n = 500): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// GID ↔ numeric ID 変換
export function gidToId(gid: string): bigint {
  const m = gid.match(/(\d+)$/);
  if (!m) throw new Error(`Invalid GID: ${gid}`);
  return BigInt(m[1]);
}

export function productGid(id: bigint | string): string {
  return `gid://shopify/Product/${id}`;
}

export function variantGid(id: bigint | string): string {
  return `gid://shopify/ProductVariant/${id}`;
}

export function inventoryItemGid(id: bigint | string): string {
  return `gid://shopify/InventoryItem/${id}`;
}

export function locationGid(id: bigint | string): string {
  return `gid://shopify/Location/${id}`;
}
