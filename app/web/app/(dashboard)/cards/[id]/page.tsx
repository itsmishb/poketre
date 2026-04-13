import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { getDemoCardDetail } from "@/lib/demo-data";
import { inventoryHref, listingsHref, newListingHref } from "@/lib/card-routes";
import { CardPublicDescriptionSection } from "@/components/cards/card-public-description";

export const metadata = {
  title: "カード種別詳細 | カード管理システム",
};

type CardRow = {
  serial_number: string;
  name_ja: string;
  set_code: string;
  card_number: string;
  rarity: string;
  card_type: string;
  stock_count?: number;
  listed_count?: number;
};

export default async function CardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const isDemo = isDemoMode;
  const supabase = await createClient();

  let row: CardRow | null = null;
  let publicDescriptionJa: string | null = null;

  if (isDemo) {
    const d = getDemoCardDetail(id);
    if (d) {
      row = {
        serial_number: d.serial_number,
        name_ja: d.name_ja,
        set_code: d.set_code,
        card_number: d.card_number,
        rarity: d.rarity,
        card_type: d.card_type,
        stock_count: d.stock_count,
        listed_count: d.listed_count,
      };
      publicDescriptionJa = d.public_description_ja ?? null;
    }
  } else if (supabase) {
    try {
      const { data } = await supabase.from("card_catalog").select("*").eq("id", id).single();
      if (data) {
        const r = data as Record<string, unknown>;
        row = {
          serial_number: String(r.serial_number ?? ""),
          name_ja: String(r.name_ja ?? ""),
          set_code: String(r.set_code ?? ""),
          card_number: String(r.card_number ?? ""),
          rarity: String(r.rarity ?? ""),
          card_type: String(r.card_type ?? ""),
          stock_count: 0,
          listed_count: 0,
        };
      }
      const { data: cardExtra, error: cardErr } = await supabase
        .from("cards")
        .select("public_description_ja")
        .eq("card_id", id)
        .maybeSingle();
      if (!cardErr && cardExtra && typeof cardExtra === "object" && "public_description_ja" in cardExtra) {
        const v = (cardExtra as { public_description_ja: string | null }).public_description_ja;
        publicDescriptionJa = typeof v === "string" ? v : null;
      }
    } catch {
      // ignore
    }
  }

  if (!row) notFound();

  return (
    <div>
      <div className="mb-4">
        <Link href="/cards" className="text-sm font-medium text-blue-600 hover:underline">
          ← カード種別一覧へ
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">カード種別詳細</h1>
      <p className="mt-1 text-slate-600">{row.serial_number}</p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-medium text-slate-500">基本情報</h2>
          <dl className="mt-2 space-y-2 text-sm">
            <div>
              <dt className="text-slate-500">カード名</dt>
              <dd className="font-medium text-slate-900">{row.name_ja}</dd>
            </div>
            <div>
              <dt className="text-slate-500">セット</dt>
              <dd className="text-slate-900">
                {row.set_code}
                <Link
                  href={`/cards?set=${encodeURIComponent(row.set_code)}`}
                  className="ml-2 text-xs font-medium text-blue-600 hover:underline"
                >
                  同セットの種別一覧
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">番号</dt>
              <dd className="text-slate-900">{row.card_number}</dd>
            </div>
            <div>
              <dt className="text-slate-500">レアリティ</dt>
              <dd className="text-slate-900">{row.rarity}</dd>
            </div>
            <div>
              <dt className="text-slate-500">種別</dt>
              <dd className="text-slate-900">{row.card_type}</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-medium text-slate-500">在庫・出品</h2>
          <dl className="mt-2 space-y-2 text-sm">
            <div>
              <dt className="text-slate-500">在庫数</dt>
              <dd className="font-medium text-slate-900">{row.stock_count?.toLocaleString() ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">出品中数</dt>
              <dd className="text-slate-900">{row.listed_count?.toLocaleString() ?? "—"}</dd>
            </div>
          </dl>
          <ul className="mt-4 flex flex-col gap-2 text-sm font-medium">
            <li>
              <Link
                href={inventoryHref({ cardId: id, serial: row.serial_number })}
                className="text-blue-600 hover:underline"
              >
                在庫一覧（このカードで絞り込み）
              </Link>
            </li>
            <li>
              <Link href={listingsHref(row.serial_number)} className="text-blue-600 hover:underline">
                出品一覧（このカードで絞り込み）
              </Link>
            </li>
            <li>
              <Link href={newListingHref(row.serial_number)} className="text-blue-600 hover:underline">
                新規出品へ
              </Link>
            </li>
          </ul>
        </div>

        <CardPublicDescriptionSection
          key={id}
          cardId={id}
          initialDescription={publicDescriptionJa}
          isDemo={isDemo}
          draftContext={{
            name_ja: row.name_ja,
            set_code: row.set_code,
            rarity: row.rarity,
            card_number_text: row.card_number,
          }}
        />
      </div>
    </div>
  );
}
