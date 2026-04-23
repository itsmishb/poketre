import { NextResponse } from "next/server";
import { requireOperatorOrAdminUser } from "@/lib/authz";
import { getShopifyClient } from "@/lib/shopify/client";
import { recordConnectionResult } from "@/lib/shopify/settings";

export async function POST() {
  const auth = await requireOperatorOrAdminUser();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  try {
    const client = await getShopifyClient();
    const data = await client.graphql<{
      shop: { name: string; myshopifyDomain: string };
      locations: { edges: Array<{ node: { id: string; name: string } }> };
    }>(
      `{ shop { name myshopifyDomain }
         locations(first: 20) { edges { node { id name } } } }`
    );
    await recordConnectionResult(true);
    return NextResponse.json({
      ok: true,
      shopName: data.shop.name,
      shopDomain: data.shop.myshopifyDomain,
      locations: data.locations.edges.map((e) => ({
        id: e.node.id.replace(/^gid:\/\/shopify\/Location\//, ""),
        name: e.node.name,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordConnectionResult(false, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
