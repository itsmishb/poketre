import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { getDemoListingDetail } from "@/lib/demo-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata = {
  title: "出品編集 | カード管理システム",
};

export default async function ListingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ serial?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const isDemo = isDemoMode;
  const supabase = await createClient();
  const serialFilter =
    typeof sp.serial === "string" && sp.serial.length > 0 ? sp.serial : undefined;
  const backHref = serialFilter
    ? `/listings?serial=${encodeURIComponent(serialFilter)}`
    : "/listings";

  let row: { channel: string; serial_number: string; name_ja: string; list_qty: number; price: number; status: string; sync_status: string; published_at: string | null } | null = null;

  if (isDemo) {
    row = getDemoListingDetail(id) ?? null;
  } else if (supabase) {
    try {
      const { data } = await supabase.from("channel_listings").select("*").eq("id", id).single();
      if (data) row = data;
    } catch {
      // ignore
    }
  }

  if (!row) notFound();

  return (
    <div>
      <div className="mb-4">
        <Link href={backHref} className="text-sm font-medium text-blue-600 hover:underline">
          ← 出品一覧へ
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">出品編集・成約登録</h1>
      <p className="mt-1 text-slate-600">{row.channel} の出品です。</p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>出品内容</CardTitle>
        </CardHeader>
        <CardContent>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><dt className="text-slate-500">チャネル</dt><dd className="font-medium text-slate-900">{row.channel}</dd></div>
          <div><dt className="text-slate-500">カード識別子</dt><dd className="text-slate-900">{row.serial_number}</dd></div>
          <div><dt className="text-slate-500">カード名</dt><dd className="text-slate-900">{row.name_ja}</dd></div>
          <div><dt className="text-slate-500">出品数</dt><dd className="text-slate-900">{row.list_qty}</dd></div>
          <div><dt className="text-slate-500">価格</dt><dd className="text-slate-900">¥{row.price.toLocaleString()}</dd></div>
          <div><dt className="text-slate-500">ステータス</dt><dd className="text-slate-900"><StatusBadge kind="listingStatus" value={row.status} /></dd></div>
          <div><dt className="text-slate-500">同期状態</dt><dd className="text-slate-900"><StatusBadge kind="syncStatus" value={row.sync_status} /></dd></div>
          <div><dt className="text-slate-500">出品日</dt><dd className="text-slate-900">{row.published_at ?? "—"}</dd></div>
        </dl>
        <p className="mt-4 text-sm text-slate-500">価格変更・成約登録は Supabase 連携後に利用できます。</p>
        </CardContent>
      </Card>
    </div>
  );
}
