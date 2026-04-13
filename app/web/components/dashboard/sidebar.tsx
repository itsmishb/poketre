"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isDemoMode } from "@/lib/demo";

type NavItem = { href: string; label: string };

const navGroups: { heading: string; items: NavItem[] }[] = [
  {
    heading: "概要",
    items: [{ href: "/", label: "ダッシュボード" }],
  },
  {
    heading: "受け入れ",
    items: [{ href: "/staging", label: "登録待ち" }],
  },
  {
    heading: "マスタ",
    items: [
      { href: "/cards", label: "カード種別" },
      { href: "/sets", label: "セット" },
      { href: "/locations", label: "棚番・保管" },
    ],
  },
  {
    heading: "在庫・販売",
    items: [
      { href: "/inventory", label: "在庫" },
      { href: "/listings", label: "出品" },
      { href: "/orders", label: "注文" },
    ],
  },
  {
    heading: "システム",
    items: [{ href: "/settings", label: "設定" }],
  },
];

function pathMatches(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar() {
  const pathname = usePathname();

  async function handleLogout() {
    if (isDemoMode) {
      window.location.href = "/login";
      return;
    }
    const supabase = createClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    window.location.href = "/login";
  }

  return (
    <aside className="flex w-56 flex-col border-r border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:z-30">
      <div className="flex h-14 shrink-0 items-center border-b border-slate-200 px-4">
        <Link href="/" className="font-semibold text-slate-800">
          カード管理システム
        </Link>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto p-2 pb-4">
        {navGroups.map((group) => (
          <div key={group.heading}>
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {group.heading}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathMatches(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-md px-3 py-2 text-sm font-medium ${
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-slate-200 p-2">
        <button
          type="button"
          onClick={handleLogout}
          className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          ログアウト
        </button>
      </div>
    </aside>
  );
}
