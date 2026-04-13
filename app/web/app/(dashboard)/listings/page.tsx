import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { getDemoListings } from "@/lib/demo-data";
import { Button } from "@/components/ui/button";
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
  title: "出品一覧 | カード管理システム",
};

type ListingRow = {
  id: string;
  channel: string;
  serial_number: string;
  name_ja: string;
  list_qty: number;
  price: number;
  status: string;
  sync_status: string;
  published_at: string | null;
};

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ serial?: string }>;
}) {
  const sp = await searchParams;
  const serialFilter =
    typeof sp.serial === "string" && sp.serial.length > 0 ? sp.serial : undefined;

  const supabase = await createClient();
  const isDemo = isDemoMode;
  let rows: ListingRow[] = isDemo ? getDemoListings() : [];

  if (!isDemo && supabase) {
    try {
      const { data } = await supabase
        .from("channel_listings")
        .select("id, channel, listed_qty, price, status, sync_status, published_at")
        .range(0, 99);
      if (data?.length)
        rows = data.map(
          (r: {
            id: string;
            channel: string;
            listed_qty: number;
            price: number;
            status: string;
            sync_status: string;
            published_at: string | null;
          }) => ({
            ...r,
            serial_number: "",
            name_ja: "",
            list_qty: r.listed_qty ?? 0,
          })
        );
    } catch {
      // テーブル未作成時
    }
  }

  const allRows = rows;
  if (serialFilter) {
    rows = rows.filter((r) => r.serial_number === serialFilter);
  }

  const hasActiveFilter = Boolean(serialFilter);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">出品一覧</h1>
          <p className="mt-1 text-slate-600">
            チャネル別の出品状況です。在庫詳細・カード種別から同じカードの出品だけに絞り込めます。
          </p>
        </div>
        <Button
          asChild
          className="shrink-0"
          aria-label="新規出品を作成"
        >
          <Link
            href={
              serialFilter
                ? `/listings/new?serial=${encodeURIComponent(serialFilter)}`
                : "/listings/new"
            }
          >
            新規出品
          </Link>
        </Button>
      </div>

      {hasActiveFilter && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-900">
          <span>
            表示中: カード識別子 <strong className="font-mono">{serialFilter}</strong>
          </span>
          <Link
            href="/listings"
            className="font-medium text-blue-700 underline-offset-2 hover:underline"
          >
            フィルタを解除
          </Link>
          <Link
            href={`/inventory?serial=${encodeURIComponent(serialFilter!)}`}
            className="font-medium text-blue-700 underline-offset-2 hover:underline"
          >
            このカードの在庫へ
          </Link>
        </div>
      )}

      {allRows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-12 text-center text-slate-600">
          {isDemo
            ? "デモデータがありません。"
            : "出品テーブル（channel_listings）連携後に一覧を表示します。"}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-8 text-center text-amber-900">
          <p>このカード識別子の出品はまだありません。</p>
          <Link
            href={`/listings/new?serial=${encodeURIComponent(serialFilter!)}`}
            className="mt-2 inline-block text-sm font-medium text-amber-800 underline"
          >
            新規出品へ
          </Link>
          <span className="mx-2 text-amber-700">·</span>
          <Link href="/listings" className="text-sm font-medium text-amber-800 underline">
            一覧へ戻る
          </Link>
        </div>
      ) : (
        <Card className="mt-6 overflow-hidden">
          <Table>
            <TableCaption>出品一覧テーブル</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>
                  チャネル
                </TableHead>
                <TableHead>
                  カード識別子
                </TableHead>
                <TableHead>
                  カード名
                </TableHead>
                <TableHead className="text-right">
                  出品数
                </TableHead>
                <TableHead className="text-right">
                  価格
                </TableHead>
                <TableHead>
                  ステータス
                </TableHead>
                <TableHead>
                  同期
                </TableHead>
                <TableHead>
                  出品日
                </TableHead>
                <TableHead>
                  操作
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-slate-900">{row.channel}</TableCell>
                  <TableCell className="text-slate-900">{row.serial_number}</TableCell>
                  <TableCell className="text-slate-900">{row.name_ja}</TableCell>
                  <TableCell className="text-right text-slate-900">{row.list_qty}</TableCell>
                  <TableCell className="text-right text-slate-900">
                    ¥{row.price.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind="listingStatus" value={row.status} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge kind="syncStatus" value={row.sync_status} />
                  </TableCell>
                  <TableCell>{row.published_at ?? "—"}</TableCell>
                  <TableCell>
                    <Link
                      href={
                        row.serial_number
                          ? `/listings/${row.id}?serial=${encodeURIComponent(row.serial_number)}`
                          : `/listings/${row.id}`
                      }
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      編集
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
