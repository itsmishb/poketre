import Link from "next/link";
import Image from "next/image";
import { CreditCard, ScanLine } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { getDemoStagingList } from "@/lib/demo-data";
import { isDatabaseConfigured } from "@/lib/server-data";
import {
  countPendingStaging,
  listPendingStaging,
  type StagingListRow,
} from "@/lib/db/staging";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { BatchProgress } from "@/components/staging/batch-progress";

export const metadata = {
  title: "登録待ち一覧 | Poketre",
};

export default async function StagingListPage() {
  const supabase = await createClient();
  const isDemo = isDemoMode;
  let rows: StagingListRow[] = [];
  let total = 0;

  if (isDemo && isDatabaseConfigured()) {
    try {
      rows = await listPendingStaging(50);
      total = await countPendingStaging();
    } catch {
      rows = getDemoStagingList() as StagingListRow[];
      total = rows.length;
    }
  } else if (isDemo) {
    rows = getDemoStagingList() as StagingListRow[];
    total = rows.length;
  } else if (supabase) {
    try {
      const { data, error } = await supabase
        .from("ocr_staging")
        .select("stg_id, serial_number, name_ja, set_code, rarity, qty, image_url, input_location_code, duplicate_status, duplicate_card_id, merge_decision, ocr_status, status")
        .in("status", ["登録待ち", "OCR中", "OCR失敗"])
        .order("created_at", { ascending: false })
        .range(0, 49);
      if (!error) {
        rows = (data ?? []).map((r) => ({ ...(r as Record<string, unknown>), id: String((r as { stg_id: string }).stg_id) })) as typeof rows;
        const { count } = await supabase
          .from("ocr_staging")
          .select("*", { count: "exact", head: true })
          .in("status", ["登録待ち", "OCR中", "OCR失敗"]);
        total = count ?? 0;
      }
    } catch {
      // テーブル未作成時・未接続時
    }
  }

  return (
    <div>
      {/* ── ヘッダー ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">登録待ち一覧</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            OCR で読み取った候補を確認し、正式登録してください。
            {total > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {total.toLocaleString()} 件
              </span>
            )}
          </p>
        </div>
        <Button asChild>
          <Link href="/staging/import">
            <ScanLine className="mr-1.5 size-4" />
            一括取り込み
          </Link>
        </Button>
      </div>

      {/* ── OCR 進捗バー（非同期バッチ処理中の場合に表示） ── */}
      <BatchProgress />

      {/* ── コンテンツ ── */}
      {rows.length === 0 ? (
        <div className="mt-8 rounded-xl border bg-card p-12 text-center text-muted-foreground">
          <CreditCard className="mx-auto mb-3 size-8 opacity-30" />
          <p className="font-medium">登録待ちの候補はありません。</p>
          <p className="mt-1 text-sm">
            スキャンした画像を取り込むと、ここに OCR 候補が表示されます。
          </p>
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded-xl border bg-card">
          {/* テーブルヘッダー */}
          <div className="grid grid-cols-[3rem_1fr_auto_auto_auto_auto] items-center gap-3 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span>画像</span>
            <span>カード情報</span>
            <span className="text-center">数量</span>
            <span className="text-center">OCR</span>
            <span className="text-center">重複</span>
            <span />
          </div>

          {/* 行 */}
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const ocrLabel =
                row.status === "OCR失敗" || row.ocr_status === "FAILED" ? "失敗" :
                row.status === "OCR中"   || row.ocr_status === "RUNNING" ? "実行中" :
                "完了";
              const dupKey = row.duplicate_status ?? "NONE";
              const dupLabel = dupKey === "CANDIDATE" ? "候補あり" : dupKey === "RESOLVED" ? "解決済" : "なし";

              return (
                <li key={row.id} className="grid grid-cols-[3rem_1fr_auto_auto_auto_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30">
                  {/* サムネイル */}
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                    {row.image_url ? (
                      <Image
                        src={row.image_url}
                        alt=""
                        width={48}
                        height={48}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <CreditCard className="size-5 text-muted-foreground/40" />
                    )}
                  </div>

                  {/* カード情報 */}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {row.name_ja ?? "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.serial_number ?? "—"}
                      {row.set_code ? ` · ${row.set_code}` : ""}
                      {row.rarity ? ` · ${row.rarity}` : ""}
                      {row.input_location_code ? ` · ${row.input_location_code}` : ""}
                    </p>
                  </div>

                  {/* 数量 */}
                  <span className="w-10 text-center text-sm tabular-nums text-foreground">
                    {(row.qty ?? 0).toLocaleString()}
                  </span>

                  {/* OCR ステータス */}
                  <StatusBadge kind="ocrStatus" value={ocrLabel} className="hidden sm:inline-flex" />

                  {/* 重複ステータス */}
                  <StatusBadge kind="duplicateStatus" value={dupLabel} className="hidden md:inline-flex" />

                  {/* 確認リンク */}
                  <Link
                    href={`/staging/${row.id}`}
                    className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                  >
                    確認
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
