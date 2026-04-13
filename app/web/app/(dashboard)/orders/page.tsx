import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { getDemoCards, getDemoOrders } from "@/lib/demo-data";
import { inventoryHref, listingsHref } from "@/lib/card-routes";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata = {
  title: "注文一覧 | カード管理システム",
};

export default async function OrdersPage() {
  const supabase = await createClient();
  const isDemo = isDemoMode;
  type OrderRow = { id: string; channel: string; external_order_id: string; ordered_at: string; card_summary: string; qty: number; sold_price: number; import_status: string };
  let rows: OrderRow[] = isDemo ? getDemoOrders() : [];
  const demoCards = isDemo ? getDemoCards() : [];
  const demoNameToSerial = new Map(demoCards.map((c) => [c.name_ja, c.serial_number]));

  const extractSerialFromSummary = (summary: string): string | null => {
    const m = summary.match(/[A-Za-z0-9]+_[0-9]+\/[0-9]+/);
    if (m) return m[0];
    for (const [name, serial] of demoNameToSerial.entries()) {
      if (summary.includes(name)) return serial;
    }
    return null;
  };

  if (!isDemo && supabase) {
    try {
      const { data } = await supabase.from("channel_orders").select("id, channel, external_order_id, ordered_at, qty, sold_price, import_status").range(0, 99);
      if (data?.length) rows = data.map((r: { id: string; channel: string; external_order_id: string; ordered_at: string; qty: number; sold_price: number; import_status: string }) => ({ ...r, card_summary: `注文 #${r.id}` }));
    } catch {
      // テーブル未作成時
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">注文一覧</h1>
      <p className="mt-1 text-slate-600">
        取り込んだ注文（Shopify 等）の一覧と引当状況です。
      </p>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-12 text-center text-slate-600">
          {isDemo ? "デモデータがありません。" : "注文テーブル（channel_orders）連携後に一覧を表示します。"}
        </div>
      ) : (
        <Card className="mt-6 overflow-hidden">
          <Table>
            <TableCaption>注文一覧テーブル</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>チャネル</TableHead>
                <TableHead>注文ID</TableHead>
                <TableHead>受注日時</TableHead>
                <TableHead>内容</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead className="text-right">売上金額</TableHead>
                <TableHead>取り込み</TableHead>
                <TableHead>関連導線</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const serial = extractSerialFromSummary(row.card_summary);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-slate-900">{row.channel}</TableCell>
                    <TableCell className="text-slate-900">{row.external_order_id}</TableCell>
                    <TableCell>{row.ordered_at}</TableCell>
                    <TableCell>{row.card_summary}</TableCell>
                    <TableCell className="text-right text-slate-900">{row.qty}</TableCell>
                    <TableCell className="text-right text-slate-900">¥{row.sold_price.toLocaleString()}</TableCell>
                    <TableCell>
                      <StatusBadge kind="importStatus" value={row.import_status} />
                    </TableCell>
                    <TableCell className="text-slate-700">
                      {serial ? (
                        <div className="flex flex-wrap gap-2">
                          <Link href={listingsHref(serial)} className="text-blue-600 hover:underline">
                            関連出品
                          </Link>
                          <Link href={inventoryHref({ serial })} className="text-blue-600 hover:underline">
                            関連在庫
                          </Link>
                        </div>
                      ) : (
                        <span className="text-slate-500">紐付けなし</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
