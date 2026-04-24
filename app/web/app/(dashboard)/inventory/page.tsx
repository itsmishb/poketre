import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { getDemoCardDetail, getDemoInventory } from "@/lib/demo-data";
import { calculateAgingDays } from "@/lib/inventory/aging";
import {
  buildInventoryFilterOptions,
  deriveSetCode,
  filterInventoryRows,
} from "@/lib/inventory/filters";
import { normalizeSortDir, normalizeSortKey, sortInventoryRows } from "@/lib/inventory/sort";
import type { InventoryFilters, InventorySortDir, InventorySortKey } from "@/lib/inventory/types";
import { InventoryFilterToolbar } from "@/components/inventory/inventory-filter-toolbar";
import { InventoryTable } from "@/components/inventory/inventory-table";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "在庫一覧 | Poketre",
};

type InventoryRow = {
  id: string;
  type: "UNIT" | "LOT";
  serial_number: string;
  name_ja: string;
  image_url?: string | null;
  set_code?: string;
  condition_grade: string;
  location_code?: string;
  location_name: string;
  qty: number;
  status: string;
  acquisition_cost: number | null;
  acquired_at?: string | null;
};

type TabKey = "all" | "in_stock" | "listed" | "sold";

const TAB_LABELS: Record<TabKey, string> = {
  all:      "全て",
  in_stock: "在庫中",
  listed:   "出品中",
  sold:     "売済",
};

function matchesTab(status: string, tab: TabKey): boolean {
  const s = status.toUpperCase();
  switch (tab) {
    case "in_stock": return ["在庫", "IN_STOCK", "RESERVED", "HOLD"].includes(status) || s === "IN_STOCK" || s === "RESERVED" || s === "HOLD";
    case "listed":   return status === "出品中" || s === "LISTED";
    case "sold":     return s === "SOLD" || s === "SHIPPED";
    default:         return true;
  }
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    card?: string;
    serial?: string;
    tab?: string;
    q?: string;
    set?: string;
    condition?: string;
    type?: string;
    status?: string;
    aging?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const sp = await searchParams;
  const tab: TabKey = (["all", "in_stock", "listed", "sold"].includes(sp.tab ?? "") ? sp.tab : "all") as TabKey;
  const queryFilter = typeof sp.q === "string" ? sp.q.trim() : "";
  const setFilter = typeof sp.set === "string" ? sp.set.trim() : "";
  const conditionFilter = typeof sp.condition === "string" ? sp.condition.trim() : "";
  const typeFilter = sp.type === "UNIT" || sp.type === "LOT" ? sp.type : "";
  const statusFilter = typeof sp.status === "string" ? sp.status.trim() : "";
  const agingFilter = sp.aging === "over90" || sp.aging === "over180" ? sp.aging : "";
  const sort: InventorySortKey = normalizeSortKey(sp.sort);
  const dir: InventorySortDir = normalizeSortDir(sp.dir);

  const supabase = await createClient();
  const isDemo = isDemoMode;

  let serialFilter: string | undefined =
    typeof sp.serial === "string" && sp.serial.length > 0 ? sp.serial : undefined;
  if (!serialFilter && typeof sp.card === "string" && sp.card.length > 0 && isDemo) {
    const cat = getDemoCardDetail(sp.card);
    if (cat) serialFilter = cat.serial_number;
  }

  let allRows: InventoryRow[] = isDemo ? getDemoInventory() : [];

  if (!isDemo && supabase) {
    try {
      const { data: units } = await supabase
        .from("inventory_units")
        .select("id, card_catalog_id, condition_grade, storage_location_id, status")
        .range(0, 49);
      const { data: lots } = await supabase
        .from("inventory_lots")
        .select("id, card_catalog_id, condition_grade, qty_on_hand, storage_location_id, status")
        .range(0, 49);
      if (units?.length || lots?.length) allRows = [];
    } catch { /* テーブル未作成時 */ }
  }

  // serial フィルター適用
  if (serialFilter) {
    allRows = allRows.filter((r) => r.serial_number === serialFilter);
  }
  allRows = allRows.map((row) => ({ ...row, set_code: deriveSetCode(row) }));

  const filters: InventoryFilters = {
    q: queryFilter,
    set: setFilter,
    condition: conditionFilter,
    type: typeFilter,
    status: statusFilter,
    aging: agingFilter,
  };
  const filteredRows = filterInventoryRows(allRows, filters);

  // タブ別件数
  const counts: Record<TabKey, number> = {
    all:      filteredRows.length,
    in_stock: filteredRows.filter((r) => matchesTab(r.status, "in_stock")).length,
    listed:   filteredRows.filter((r) => matchesTab(r.status, "listed")).length,
    sold:     filteredRows.filter((r) => matchesTab(r.status, "sold")).length,
  };

  // 表示行（タブフィルター）
  const rows = sortInventoryRows(
    filteredRows
      .filter((r) => matchesTab(r.status, tab))
      .map((r) => ({ ...r, aging_days: calculateAgingDays(r.acquired_at) })),
    sort,
    dir
  );
  const hasSerialFilter = Boolean(serialFilter);
  const { setOptions, conditionOptions, statusOptions } = buildInventoryFilterOptions(allRows);

  function tabHref(t: TabKey) {
    const params = new URLSearchParams();
    if (serialFilter) params.set("serial", serialFilter);
    if (queryFilter) params.set("q", queryFilter);
    if (setFilter) params.set("set", setFilter);
    if (conditionFilter) params.set("condition", conditionFilter);
    if (typeFilter) params.set("type", typeFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (agingFilter) params.set("aging", agingFilter);
    if (sort !== "name") params.set("sort", sort);
    if (dir !== "asc") params.set("dir", dir);
    if (t !== "all") params.set("tab", t);
    const qs = params.toString();
    return `/inventory${qs ? `?${qs}` : ""}`;
  }

  return (
    <div>
      {/* ── ヘッダー ── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">在庫一覧</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          現物在庫（1枚単位・ロット）の一覧です。保管場所の見える化は
          <Link href="/locations" className="mx-0.5 text-primary hover:underline">棚番ビュー</Link>
          へ。
        </p>
      </div>

      <InventoryFilterToolbar
        initialQuery={queryFilter}
        initialSet={setFilter}
        initialCondition={conditionFilter}
        initialType={typeFilter}
        initialStatus={statusFilter}
        initialAging={agingFilter}
        setOptions={setOptions.map((v) => ({ value: v, label: v }))}
        conditionOptions={conditionOptions.map((v) => ({ value: v, label: v }))}
        statusOptions={statusOptions.map((v) => ({ value: v, label: v }))}
      />

      {/* ── serial フィルターバナー ── */}
      {hasSerialFilter && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-primary/20 bg-accent px-4 py-3 text-sm text-accent-foreground">
          <span>
            カード識別子: <strong className="font-mono">{serialFilter}</strong>
          </span>
          <Link href="/inventory" className="font-medium text-primary hover:underline">
            フィルタを解除
          </Link>
          <Link
            href={serialFilter ? `/listings?serial=${encodeURIComponent(serialFilter)}` : "/listings"}
            className="font-medium text-primary hover:underline"
          >
            このカードの出品へ
          </Link>
        </div>
      )}

      {/* ── ステータスタブ ── */}
      {filteredRows.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-1 rounded-lg border bg-muted p-1">
          {(Object.keys(TAB_LABELS) as TabKey[]).map((t) => (
            <Link
              key={t}
              href={tabHref(t)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === t
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {TAB_LABELS[t]}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs",
                  tab === t ? "bg-primary/10 text-primary" : "bg-muted-foreground/15 text-muted-foreground"
                )}
              >
                {counts[t]}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* ── テーブル ── */}
      {allRows.length === 0 ? (
        <div className="mt-8 rounded-xl border bg-card p-12 text-center text-muted-foreground">
          {isDemo
            ? "デモデータがありません。"
            : "在庫テーブル（inventory_units / inventory_lots）連携後に一覧を表示します。"}
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-900">
          <p>この条件に一致する在庫はありません。</p>
          <Link href={tabHref("all")} className="mt-2 inline-block text-sm font-medium text-amber-800 underline">
            全て表示
          </Link>
        </div>
      ) : (
        <InventoryTable rows={rows} sort={sort} dir={dir} />
      )}
    </div>
  );
}
