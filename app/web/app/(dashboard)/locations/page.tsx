import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import {
  getDemoBoxOccupancyCounts,
  getDemoImageUrlBySerial,
  getDemoInventoryByColumnsInBox,
} from "@/lib/demo-data";
import { InventoryTilePreview } from "@/components/locations/inventory-tile-preview";
import { ShelfGuide } from "@/components/locations/shelf-guide";
import {
  STORAGE_BOXES_PER_TIER,
  STORAGE_COLUMNS_PER_BOX,
  STORAGE_TIERS,
  clampBox,
  clampTier,
  formatLocationCode,
} from "@/lib/storage-layout";
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
  title: "棚番・保管ビュー | カード管理システム",
};

type LegacyLocationRow = {
  id: string;
  warehouse: string;
  zone: string;
  shelf: string;
  bin: string;
  slot: string;
  barcode: string | null;
  active: boolean;
};

export default async function LocationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; box?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const isDemo = isDemoMode;

  const tier = clampTier(parseInt(sp.tier ?? "1", 10));
  const box = clampBox(parseInt(sp.box ?? "1", 10));

  let legacyRows: LegacyLocationRow[] = [];
  if (!isDemo && supabase) {
    try {
      const { data } = await supabase
        .from("storage_locations")
        .select("*")
        .eq("active_flag", true)
        .range(0, 99);
      if (data?.length)
        legacyRows = data.map(
          (r: {
            id: string;
            warehouse: string;
            zone: string;
            shelf: string;
            bin: string;
            slot: string;
            barcode: string | null;
            active_flag: boolean;
          }) => ({ ...r, active: r.active_flag })
        );
    } catch {
      // テーブル未作成時
    }
  }

  const occupancy = isDemo ? getDemoBoxOccupancyCounts() : new Map<string, number>();
  const columnsData = isDemo ? getDemoInventoryByColumnsInBox(tier, box) : [[], [], [], [], []];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">棚番・保管ビュー</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        倉庫の「どの箱のどの列か」を見える化します。下の説明のあと、箱を選ぶと 5 列の中身が開きます。
      </p>

      <ShelfGuide activeTier={tier} showTierNav={isDemo} />

      {!isDemo && legacyRows.length === 0 && (
        <div className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          <p className="font-medium">本番データでは座標ビューは未接続です</p>
          <p className="mt-1">
            在庫に <span className="font-mono">tier-box-column</span> 形式のコード（または同等の外部キー）を持たせ、
            <code className="rounded bg-amber-100/80 px-1">storage_locations</code> と揃えると、このグリッドに反映できます。
          </p>
        </div>
      )}

      {!isDemo && legacyRows.length > 0 && (
        <details className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            従来の棚マスタ一覧（storage_locations）
          </summary>
          <div className="mt-4 overflow-x-auto text-sm">
            <Card className="overflow-hidden shadow-none">
            <Table>
              <TableCaption>従来の棚マスタ一覧</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>倉庫</TableHead>
                  <TableHead>ゾーン</TableHead>
                  <TableHead>棚</TableHead>
                  <TableHead>ビン</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {legacyRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.warehouse}</TableCell>
                    <TableCell>{row.zone}</TableCell>
                    <TableCell>{row.shelf}</TableCell>
                    <TableCell>{row.bin}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </Card>
          </div>
        </details>
      )}

      {isDemo && (
        <>
          <div className="mt-6 space-y-8">
            {Array.from({ length: STORAGE_TIERS }, (_, ti) => {
              const t = ti + 1;
              return (
                <div
                  key={t}
                  id={`tier-${t}`}
                  className="scroll-mt-28 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <h2 className="text-base font-semibold text-slate-900">
                    棚段 {t}{" "}
                    <span className="text-sm font-normal text-slate-500">
                      （箱 {t}-1 〜 {t}-{STORAGE_BOXES_PER_TIER}）
                    </span>
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    マスを押すと下の「箱の中身」がその箱に切り替わります。
                  </p>
                  <div className="mt-3 grid grid-cols-5 gap-1.5 sm:grid-cols-10 lg:grid-cols-10">
                    {Array.from({ length: STORAGE_BOXES_PER_TIER }, (_, bi) => {
                      const b = bi + 1;
                      const key = `${t}-${b}`;
                      const n = occupancy.get(key) ?? 0;
                      const selected = tier === t && box === b;
                      return (
                        <Link
                          key={key}
                          href={`/locations?tier=${t}&box=${b}#box-detail`}
                          scroll={true}
                          className={`flex min-h-[2.75rem] flex-col items-center justify-center rounded-lg border px-0.5 py-1.5 text-center transition ${
                            selected
                              ? "border-blue-500 bg-blue-50 text-blue-900 ring-2 ring-blue-400"
                              : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                          }`}
                        >
                          <span className="font-mono text-[11px] font-semibold sm:text-xs">
                            {t}-{b}
                          </span>
                          {n > 0 && (
                            <span className="mt-0.5 rounded-full bg-slate-800/90 px-1.5 text-[9px] font-medium text-white">
                              {n}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <section
            id="box-detail"
            className="scroll-mt-28 mt-10 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <header className="border-b border-slate-100 pb-3">
              <h2 className="text-lg font-semibold text-slate-900">
                箱 <span className="font-mono">{tier}-{box}</span> の中身
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                横に {STORAGE_COLUMNS_PER_BOX} 列。1 列に在庫を複数行載せられます。
              </p>
            </header>

            <div className="mt-5 grid gap-3 sm:grid-cols-5">
              {columnsData.map((items, idx) => {
                const col = idx + 1;
                const code = formatLocationCode(tier, box, col);
                return (
                  <div
                    key={code}
                    id={`slot-${code}`}
                    className="flex min-h-[12rem] flex-col rounded-xl border border-slate-200 bg-slate-50/50"
                  >
                    <div className="border-b border-slate-200 bg-slate-100 px-2 py-1.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-slate-800">{code}</span>
                        {items.length > 1 && (
                          <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                            {items.length}ライン
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500">列 {col}</div>
                    </div>
                    <div
                      className={`flex flex-1 flex-col gap-2 p-2 ${items.length > 2 ? "max-h-[min(28rem,70vh)] overflow-y-auto overscroll-contain" : ""}`}
                    >
                      {items.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white/80 px-2 py-6 text-center text-xs text-slate-400">
                          空
                        </div>
                      ) : (
                        items.map((inv) => (
                          <InventoryTilePreview
                            key={inv.id}
                            compact
                            id={inv.id}
                            serial_number={inv.serial_number}
                            name_ja={inv.name_ja}
                            qty={inv.qty}
                            type={inv.type}
                            status={inv.status}
                            imageUrl={getDemoImageUrlBySerial(inv.serial_number)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <p className="mt-6 text-center text-xs text-slate-400">
            在庫詳細の「この箱の棚ビュー」から、同じ箱を開いた状態でジャンプできます。
          </p>
        </>
      )}
    </div>
  );
}
