import { NextResponse } from "next/server";
import { requireOperatorOrAdminUser } from "@/lib/authz";
import { getShopifySettings, saveShopifySettings } from "@/lib/shopify/settings";

export async function GET() {
  const auth = await requireOperatorOrAdminUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const s = await getShopifySettings();
  return NextResponse.json({
    shopDomain: s.shopDomain,
    apiVersion: s.apiVersion,
    locationId: s.locationId?.toString() ?? null,
    hasAccessToken: Boolean(s.accessToken),
    hasWebhookSecret: Boolean(s.webhookSecret),
    lastConnectedAt: s.lastConnectedAt,
    lastError: s.lastError,
  });
}

export async function POST(req: Request) {
  const auth = await requireOperatorOrAdminUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const body = (await req.json().catch(() => null)) as {
    shopDomain?: string | null;
    apiVersion?: string;
    accessToken?: string | null;
    locationId?: string | null;
    webhookSecret?: string | null;
  } | null;
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  await saveShopifySettings({
    shopDomain: body.shopDomain,
    apiVersion: body.apiVersion,
    accessToken: body.accessToken,
    locationId:
      body.locationId === undefined
        ? undefined
        : body.locationId === null || body.locationId === ""
          ? null
          : BigInt(body.locationId),
    webhookSecret: body.webhookSecret,
  });
  return NextResponse.json({ ok: true });
}
