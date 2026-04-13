import Link from "next/link";
import { LayoutGrid, LayoutList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { getDemoCards } from "@/lib/demo-data";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CardGrid } from "@/components/cards/card-grid";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "カード種別一覧 | Poketre",
};

type CardRow = {
  id: string;
  serial_number: string;
  name_ja: string;
  set_code: string;
  card_number: string;
  rarity: string;
  card_type: string;
  stock_count?: number;
  listed_count?: number;
};

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const setFilter = typeof sp.set === "string" && sp.set.length > 0 ? sp.set : undefined;
  const view: "grid" | "table" = sp.view === "table" ? "table" : "grid";

  const supabase = await createClient();
  const isDemo = isDemoMode;
  let rows: CardRow[] = isDemo ? getDemoCards() : [];

  if (!isDemo && supabase) {
    try {
      let q = supabase
        .from("card_catalog")
        .select("id, serial_number, name_ja, set_code, card_number, rarity, card_type");
      if (setFilter) q = q.eq("set_code", setFilter);
      q = q.order("set_code").order("card_number").range(0, 199);
      const { data } = await q;
      if (data?.length)
        rows = data.map((r: CardRow) => ({ ...r, stock_count: 0, listed_count: 0 }));
    } catch { /* テーブル未作成時 */ }
  } else if (setFilter) {
    rows = rows.filter((r) => r.set_code === setFilter);
  }

  // トグル用のリンク（現在のフィルターを維持）
  function viewHref(v: "grid" | "table") {
    const params = new URLSearchParams();
    if (setFilter) params.set("set", setFilter);
    if (v !== "grid") params.set("view", v); // grid はデフォルトなので省略
    const qs = params.toString();
    return `/cards${qs ? `?${qs}` : ""}`;
  }

  const toggleClass = (active: boolean) =>
    cn(
      "flex items-center justify-center rounded p-1.5 transition-colors",
      active ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
    );

  return (
    <div>
      {/* ── ヘッダー ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">カード種別一覧</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            登録済みのカード種別を参照します。
            <Link href="/sets" className="ml-1 text-primary hover:underline">
              セット一覧
            </Link>
            からセット単位で絞り込めます。
          </p>
        </div>

        {/* ビュートグル */}
        <div className="flex shrink-0 items-center rounded-lg border bg-muted p-1">
          <Link href={viewHref("grid")} className={toggleClass(view === "grid")} aria-label="グリッド表示">
            <LayoutGrid className="size-4" />
          </Link>
          <Link href={viewHref("table")} className={toggleClass(view === "table")} aria-label="テーブル表示">
            <LayoutList className="size-4" />
          </Link>
        </div>
      </div>

      {/* ── セットフィルター ── */}
      {setFilter && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-accent px-4 py-3 text-sm text-accent-foreground">
          <span>
            セットコード: <strong className="font-mono">{setFilter}</strong>
          </span>
          <Link href="/cards" className="font-medium text-primary hover:underline">
            全セットを表示
          </Link>
          <Link href="/sets" className="font-medium text-primary hover:underline">
            セット一覧へ
          </Link>
        </div>
      )}

      {/* ── コンテンツ ── */}
      {rows.length === 0 ? (
        <div className="mt-8 rounded-xl border bg-card p-12 text-center text-muted-foreground">
          {setFilter ? (
            <>
              <p>このセットコードに該当するカード種別はまだありません。</p>
              <Link href="/cards" className="mt-2 inline-block text-sm text-primary hover:underline">
                一覧を表示
              </Link>
            </>
          ) : isDemo ? (
            "デモデータがありません。"
          ) : (
            "カード種別テーブル（card_catalog）連携後に一覧を表示します。"
          )}
        </div>
      ) : view === "grid" ? (
        <div className="mt-6">
          <CardGrid rows={rows} />
        </div>
      ) : (
        <Card className="mt-6 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>カード識別子</TableHead>
                <TableHead>カード名</TableHead>
                <TableHead>セット</TableHead>
                <TableHead>番号</TableHead>
                <TableHead>レアリティ</TableHead>
                <TableHead>種別</TableHead>
                <TableHead className="text-right">在庫数</TableHead>
                <TableHead className="text-right">出品中</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.serial_number}</TableCell>
                  <TableCell>{row.name_ja}</TableCell>
                  <TableCell>{row.set_code}</TableCell>
                  <TableCell>{row.card_number}</TableCell>
                  <TableCell>{row.rarity}</TableCell>
                  <TableCell>{row.card_type}</TableCell>
                  <TableCell className="text-right">{row.stock_count?.toLocaleString() ?? "—"}</TableCell>
                  <TableCell className="text-right">{row.listed_count?.toLocaleString() ?? "—"}</TableCell>
                  <TableCell>
                    <Link href={`/cards/${row.id}`} className="text-sm font-medium text-primary hover:underline">
                      詳細
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
