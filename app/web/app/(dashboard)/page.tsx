import Link from "next/link";
import {
  AlertCircle,
  Package,
  ScanLine,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import {
  getDemoDashboardKpis,
  getDemoSalesChart,
  getDemoStagingList,
} from "@/lib/demo-data";
import { SalesChart } from "@/components/dashboard/sales-chart";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { StagingPreview } from "@/components/dashboard/staging-preview";
import type { SalesChartPoint } from "@/lib/demo-data";

export const metadata = {
  title: "ダッシュボード | Poketre",
};

// ---- KPI カード --------------------------------------------------------

type KpiCardProps = {
  label: string;
  value: string;
  sub?: string;
  href: string;
  linkLabel: string;
  icon: React.ElementType;
  trend?: number; // % 変化。正 = 上昇
  trendLabel?: string;
};

function KpiCard({
  label,
  value,
  sub,
  href,
  linkLabel,
  icon: Icon,
  trend,
  trendLabel,
}: KpiCardProps) {
  const hasTrend = trend != null;
  const isUp = (trend ?? 0) >= 0;

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className="size-4 shrink-0 text-muted-foreground/60" />
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      {hasTrend && (
        <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${isUp ? "text-emerald-600" : "text-red-500"}`}>
          {isUp ? (
            <TrendingUp className="size-3" />
          ) : (
            <TrendingDown className="size-3" />
          )}
          {trendLabel ?? `${isUp ? "+" : ""}${trend}%`}
        </p>
      )}
      <Link
        href={href}
        className="mt-3 inline-block text-xs text-primary hover:underline"
      >
        {linkLabel} →
      </Link>
    </div>
  );
}

// ---- Page --------------------------------------------------------------

export default async function DashboardPage() {
  const supabase = await createClient();
  const isDemo = isDemoMode;

  let stagingCount = 0;
  let totalStock: number | null = null;
  let stockValue: number | null = null;
  let monthlySales: number | null = null;
  let prevMonthlySales: number | null = null;
  let syncErrors: number | null = null;
  let chartData: SalesChartPoint[] = [];
  type StagingPreviewItem = {
    id: string;
    name_ja: string;
    set_code: string;
    rarity: string;
    image_url: string | null;
    card_number_text?: string;
  };
  let stagingItems: StagingPreviewItem[] = [];

  if (isDemo) {
    const kpis = getDemoDashboardKpis();
    stagingCount      = kpis.stagingCount;
    totalStock        = kpis.totalStock;
    stockValue        = kpis.stockValue;
    monthlySales      = kpis.monthlySales;
    prevMonthlySales  = kpis.prevMonthlySales;
    syncErrors        = kpis.syncErrors;
    chartData         = getDemoSalesChart();
    stagingItems      = getDemoStagingList().slice(0, 5);
  } else if (supabase) {
    try {
      const { count } = await supabase
        .from("ocr_staging")
        .select("*", { count: "exact", head: true })
        .eq("status", "登録待ち");
      stagingCount = count ?? 0;
    } catch { /* テーブル未作成時は 0 */ }
  }

  // 売上トレンド計算（先月比 %）
  const salesTrend =
    prevMonthlySales != null && prevMonthlySales > 0 && monthlySales != null
      ? Math.round(((monthlySales - prevMonthlySales) / prevMonthlySales) * 100)
      : undefined;

  return (
    <div className="space-y-6">

      {/* ── KPI ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="登録待ち"
          value={`${stagingCount.toLocaleString()} 件`}
          href="/staging"
          linkLabel="一覧を確認"
          icon={ScanLine}
        />
        <KpiCard
          label="総在庫数"
          value={totalStock != null ? totalStock.toLocaleString() : "—"}
          sub={stockValue != null ? `評価額 約 ¥${stockValue.toLocaleString()}` : undefined}
          href="/inventory"
          linkLabel="在庫一覧へ"
          icon={Package}
        />
        <KpiCard
          label="今月の売上"
          value={monthlySales != null ? `¥${monthlySales.toLocaleString()}` : "—"}
          href="/orders"
          linkLabel="注文一覧へ"
          icon={Wallet}
          trend={salesTrend}
          trendLabel={salesTrend != null ? `先月比 ${salesTrend > 0 ? "+" : ""}${salesTrend}%` : undefined}
        />
        <KpiCard
          label="連携エラー"
          value={syncErrors != null ? syncErrors.toLocaleString() : "—"}
          sub={syncErrors === 0 ? "正常稼働中" : undefined}
          href="/listings"
          linkLabel="出品一覧へ"
          icon={AlertCircle}
        />
      </div>

      {/* ── 売上グラフ + クイックアクション ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">売上推移（過去 30 日）</h3>
            {monthlySales != null && (
              <span className="text-xs text-muted-foreground">
                今月累計 ¥{monthlySales.toLocaleString()}
              </span>
            )}
          </div>
          {chartData.length > 0 ? (
            <SalesChart data={chartData} />
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
              売上データがありません
            </div>
          )}
        </div>

        <QuickActions />
      </div>

      {/* ── 登録待ちプレビュー ── */}
      {stagingItems.length > 0 && (
        <StagingPreview items={stagingItems} />
      )}

    </div>
  );
}
