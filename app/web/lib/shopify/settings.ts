import "server-only";
import { getPool } from "@/lib/db/pool";
import { encrypt, decrypt } from "./crypto";

export type ShopifySettings = {
  shopDomain: string | null;
  apiVersion: string;
  accessToken: string | null;
  locationId: bigint | null;
  webhookSecret: string | null;
  lastConnectedAt: Date | null;
  lastError: string | null;
};

type SettingsRow = {
  shop_domain: string | null;
  api_version: string;
  access_token_ciphertext: string | null;
  access_token_iv: string | null;
  access_token_tag: string | null;
  location_id: string | null;
  webhook_secret_ciphertext: string | null;
  webhook_secret_iv: string | null;
  webhook_secret_tag: string | null;
  last_connected_at: Date | null;
  last_error: string | null;
};

export async function getShopifySettings(): Promise<ShopifySettings> {
  const pool = getPool();
  const { rows } = await pool.query<SettingsRow>(
    `SELECT shop_domain, api_version,
            access_token_ciphertext, access_token_iv, access_token_tag,
            location_id,
            webhook_secret_ciphertext, webhook_secret_iv, webhook_secret_tag,
            last_connected_at, last_error
     FROM shopify_settings WHERE id = 1`
  );
  const r = rows[0];
  if (!r) {
    return {
      shopDomain: null,
      apiVersion: "2025-01",
      accessToken: null,
      locationId: null,
      webhookSecret: null,
      lastConnectedAt: null,
      lastError: null,
    };
  }
  return {
    shopDomain: r.shop_domain,
    apiVersion: r.api_version,
    accessToken:
      r.access_token_ciphertext && r.access_token_iv && r.access_token_tag
        ? decrypt({
            ciphertext: r.access_token_ciphertext,
            iv: r.access_token_iv,
            tag: r.access_token_tag,
          })
        : null,
    locationId: r.location_id ? BigInt(r.location_id) : null,
    webhookSecret:
      r.webhook_secret_ciphertext && r.webhook_secret_iv && r.webhook_secret_tag
        ? decrypt({
            ciphertext: r.webhook_secret_ciphertext,
            iv: r.webhook_secret_iv,
            tag: r.webhook_secret_tag,
          })
        : null,
    lastConnectedAt: r.last_connected_at,
    lastError: r.last_error,
  };
}

export type SettingsInput = {
  shopDomain?: string | null;
  apiVersion?: string;
  accessToken?: string | null;
  locationId?: bigint | null;
  webhookSecret?: string | null;
};

export async function saveShopifySettings(input: SettingsInput): Promise<void> {
  const pool = getPool();
  const sets: string[] = ["updated_at = now()"];
  const vals: unknown[] = [];
  let i = 1;

  if (input.shopDomain !== undefined) {
    sets.push(`shop_domain = $${i++}`);
    vals.push(normalizeDomain(input.shopDomain));
  }
  if (input.apiVersion !== undefined) {
    sets.push(`api_version = $${i++}`);
    vals.push(input.apiVersion);
  }
  if (input.locationId !== undefined) {
    sets.push(`location_id = $${i++}`);
    vals.push(input.locationId === null ? null : input.locationId.toString());
  }
  if (input.accessToken !== undefined) {
    if (input.accessToken === null || input.accessToken === "") {
      sets.push(
        `access_token_ciphertext = NULL`,
        `access_token_iv = NULL`,
        `access_token_tag = NULL`
      );
    } else {
      const e = encrypt(input.accessToken);
      sets.push(
        `access_token_ciphertext = $${i++}`,
        `access_token_iv = $${i++}`,
        `access_token_tag = $${i++}`
      );
      vals.push(e.ciphertext, e.iv, e.tag);
    }
  }
  if (input.webhookSecret !== undefined) {
    if (input.webhookSecret === null || input.webhookSecret === "") {
      sets.push(
        `webhook_secret_ciphertext = NULL`,
        `webhook_secret_iv = NULL`,
        `webhook_secret_tag = NULL`
      );
    } else {
      const e = encrypt(input.webhookSecret);
      sets.push(
        `webhook_secret_ciphertext = $${i++}`,
        `webhook_secret_iv = $${i++}`,
        `webhook_secret_tag = $${i++}`
      );
      vals.push(e.ciphertext, e.iv, e.tag);
    }
  }

  await pool.query(
    `INSERT INTO shopify_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`
  );
  if (sets.length > 1) {
    await pool.query(`UPDATE shopify_settings SET ${sets.join(", ")} WHERE id = 1`, vals);
  }
}

export async function recordConnectionResult(ok: boolean, error?: string): Promise<void> {
  const pool = getPool();
  if (ok) {
    await pool.query(
      `UPDATE shopify_settings SET last_connected_at = now(), last_error = NULL, updated_at = now() WHERE id = 1`
    );
  } else {
    await pool.query(
      `UPDATE shopify_settings SET last_error = $1, updated_at = now() WHERE id = 1`,
      [error ?? "unknown error"]
    );
  }
}

function normalizeDomain(d: string | null): string | null {
  if (!d) return null;
  const trimmed = d.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : null;
}
