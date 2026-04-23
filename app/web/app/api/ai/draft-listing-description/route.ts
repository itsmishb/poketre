import { NextResponse } from "next/server";
import { generateListingDescriptionWithVertex, isVertexListingDraftConfigured } from "@/lib/ai/vertex-listing-draft";
import { parseListingDescriptionBody } from "@/lib/ai/listing-description-prompt";
import { requireOperatorOrAdminUser } from "@/lib/authz";

/**
 * 出品向け紹介文の下書き（Vertex AI / Gemini）。
 * GOOGLE_CLOUD_PROJECT + VERTEX_LOCATION（または GOOGLE_CLOUD_LOCATION）が必須。
 * サーバーレスでは GCP_SERVICE_ACCOUNT_JSON にサービスアカウント JSON 全文を渡す。
 * レート制限は今後対応（issue #22）。
 */
export async function POST(request: Request) {
  const auth = await requireOperatorOrAdminUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  if (!isVertexListingDraftConfigured()) {
    return NextResponse.json(
      {
        error:
          "Vertex AI が未設定です。GOOGLE_CLOUD_PROJECT と VERTEX_LOCATION（例: asia-northeast1）を設定してください。認証は ADC または GCP_SERVICE_ACCOUNT_JSON。",
      },
      { status: 503 }
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON ボディが不正です。" }, { status: 400 });
  }

  const body = parseListingDescriptionBody(raw);
  if (!body) {
    return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  }

  const name = typeof body.name_ja === "string" ? body.name_ja.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name_ja は必須です。" }, { status: 400 });
  }

  try {
    const { text, model } = await generateListingDescriptionWithVertex(body);
    return NextResponse.json({ text, model });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Vertex AI エラー", detail: message.slice(0, 500) },
      { status: 502 }
    );
  }
}
