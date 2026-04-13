import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { getDemoInventoryDetail } from "@/lib/demo-data";
import { locationsPageHrefForCode } from "@/lib/storage-layout";
import { listingsHref, newListingHref } from "@/lib/card-routes";

export const metadata = {
  title: "在庫詳細 | カード管理システム",
};

export default async function InventoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const isDemo = isDemoMode;
  const supabase = await createClient();

  let row: {
    type?: string;
    serial_number: string;
    name_ja: string;
    condition_grade: string;
    location_code?: string;
    location_name: string;
    qty: number;
    status: string;
    acquisition_cost: number | null;
  } | null = null;

  if (isDemo) {
    row = getDemoInventoryDetail(id) ?? null;
  } else if (supabase) {
    try {
      const { data: u } = await supabase.from("inventory_units").select("*").eq("id", id).single();
      const { data: l } = await supabase.from("inventory_lots").select("*").eq("id", id).single();
      const d = u ?? l;
      if (d) row = { type: u ? "UNIT" : "LOT", serial_number: "", name_ja: "", condition_grade: d.condition_grade ?? "", location_name: "", qty: (d as { qty_on_hand?: number }).qty_on_hand ?? 1, status: d.status ?? "", acquisition_cost: (d as { acquisition_cost?: number }).acquisition_cost ?? null };
    } catch {
      // ignore
    }
  }

  if (!row) notFound();

  const shelfViewHref =
    isDemo && row.location_code ? locationsPageHrefForCode(row.location_code) : null;

  return (
    <div>
      <div className="mb-4">
        <Link href="/inventory" className="text-sm font-medium text-blue-600 hover:underline">← 在庫一覧へ</Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">在庫詳細</h1>
      <p className="mt-1 text-slate-600">{row.type === "UNIT" ? "1枚単位" : "ロット"}の在庫です。</p>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-medium text-slate-500">在庫情報</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><dt className="text-slate-500">カード識別子</dt><dd className="font-medium text-slate-900">{row.serial_number}</dd></div>
          <div><dt className="text-slate-500">カード名</dt><dd className="text-slate-900">{row.name_ja}</dd></div>
          <div><dt className="text-slate-500">状態</dt><dd className="text-slate-900">{row.condition_grade}</dd></div>
          <div>
            <dt className="text-slate-500">棚座標</dt>
            <dd className="text-slate-900">
              {row.location_code ? (
                <span className="font-mono text-sm font-semibold">{row.location_code}</span>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">保管場所（表示名）</dt>
            <dd className="text-slate-900">
              {row.location_name || "—"}
              {shelfViewHref && (
                <Link
                  href={shelfViewHref}
                  className="ml-2 text-xs font-medium text-blue-600 hover:underline"
                >
                  この箱の棚ビュー
                </Link>
              )}
            </dd>
          </div>
          <div><dt className="text-slate-500">数量</dt><dd className="text-slate-900">{row.qty.toLocaleString()}</dd></div>
          <div><dt className="text-slate-500">ステータス</dt><dd className="text-slate-900">{row.status}</dd></div>
          <div><dt className="text-slate-500">取得原価</dt><dd className="text-slate-900">{row.acquisition_cost != null ? `¥${row.acquisition_cost.toLocaleString()}` : "—"}</dd></div>
        </dl>
        <p className="mt-4 text-sm text-slate-500">入出庫記録・保管場所変更は Supabase 連携後に利用できます。</p>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-medium text-slate-500">このカードの出品</h2>
        <p className="mt-1 text-sm text-slate-600">
          カード識別子 <span className="font-mono font-medium">{row.serial_number}</span>{" "}
          で一覧を絞り込みます。
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          <li>
            <Link
              href={listingsHref(row.serial_number)}
              className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100"
            >
              出品一覧（このカード）
            </Link>
          </li>
          <li>
            <Link
              href={newListingHref(row.serial_number)}
              className="inline-flex rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              新規出品へ
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
