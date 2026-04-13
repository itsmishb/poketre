import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { getDemoDashboardKpis } from "@/lib/demo-data";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DemoBanner } from "@/components/dashboard/demo-banner";
import { Topbar } from "@/components/dashboard/topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isDemoMode) {
    try {
      const supabase = await createClient();
      if (supabase) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) redirect("/login");
      }
    } catch {
      redirect("/login");
    }
  }

  // サイドバーバッジ用に登録待ち件数を取得
  let stagingCount = 0;
  if (isDemoMode) {
    stagingCount = getDemoDashboardKpis().stagingCount;
  } else {
    try {
      const supabase = await createClient();
      if (supabase) {
        const { count } = await supabase
          .from("ocr_staging")
          .select("*", { count: "exact", head: true })
          .eq("status", "登録待ち");
        stagingCount = count ?? 0;
      }
    } catch {
      // テーブル未作成時は 0
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar stagingCount={stagingCount} />
      <SidebarInset>
        <DemoBanner />
        <Topbar />
        <main className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
