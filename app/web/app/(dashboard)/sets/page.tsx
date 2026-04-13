import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { countDemoCardsInSet, getDemoSets } from "@/lib/demo-data";
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

export const metadata = {
  title: "セット一覧 | カード管理システム",
};

type SetRow = {
  id: string;
  set_code: string;
  set_name_ja: string;
  series: string;
  release_date: string;
  total_cards: number;
  regulation_set: string;
};

export default async function SetsPage() {
  const supabase = await createClient();
  const isDemo = isDemoMode;
  let rows: SetRow[] = isDemo ? getDemoSets() : [];

  if (!isDemo && supabase) {
    try {
      const { data } = await supabase.from("sets").select("*").order("set_code").range(0, 99);
      if (data?.length) rows = data as SetRow[];
    } catch {
      // テーブル未作成時
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">セット一覧</h1>
      <p className="mt-1 text-slate-600">
        セット（拡張パック等）のマスタです。行から{" "}
        <Link href="/cards" className="text-blue-600 hover:underline">
          カード種別一覧
        </Link>
        をそのセットコードで絞り込めます。
      </p>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-lg border border-slate-200 bg-white p-12 text-center text-slate-600">
          {isDemo ? "デモデータがありません。" : "セットテーブル（sets）連携後に一覧を表示します。"}
        </div>
      ) : (
        <Card className="mt-6 overflow-hidden">
          <Table>
            <TableCaption>セット一覧テーブル</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>セットコード</TableHead>
                <TableHead>セット名</TableHead>
                <TableHead>シリーズ</TableHead>
                <TableHead>発売日</TableHead>
                <TableHead className="text-right">総枚数</TableHead>
                <TableHead>レギュレーション</TableHead>
                <TableHead>カード</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const registered = isDemo ? countDemoCardsInSet(row.set_code) : null;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-slate-900">{row.set_code}</TableCell>
                    <TableCell className="text-slate-900">{row.set_name_ja}</TableCell>
                    <TableCell>{row.series}</TableCell>
                    <TableCell>{row.release_date}</TableCell>
                    <TableCell className="text-right text-slate-900">{row.total_cards}</TableCell>
                    <TableCell>{row.regulation_set}</TableCell>
                    <TableCell>
                      <Link
                        href={`/cards?set=${encodeURIComponent(row.set_code)}`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        {registered != null
                          ? `種別を見る（登録 ${registered} 件）`
                          : "種別を見る"}
                      </Link>
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
