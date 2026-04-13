"use client";

import React from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

const ROUTE_LABELS: Record<string, string> = {
  staging:   "登録待ち",
  import:    "一括取り込み",
  cards:     "カード種別",
  sets:      "セット",
  locations: "棚番・保管",
  inventory: "在庫",
  listings:  "出品",
  new:       "新規作成",
  orders:    "注文",
  settings:  "設定",
  shopify:   "Shopify",
};

const ID_PATTERN = /^[0-9a-f-]{8,}$|^\d+$/i;

function segmentLabel(seg: string): string {
  return ROUTE_LABELS[seg] ?? (ID_PATTERN.test(seg) ? "詳細" : seg);
}

export function Topbar() {
  const pathname = usePathname();
  const segments = pathname === "/" ? [] : pathname.split("/").filter(Boolean);

  type Crumb = { href: string; label: string };
  const crumbs: Crumb[] = segments.map((seg, i) => ({
    href:  "/" + segments.slice(0, i + 1).join("/"),
    label: segmentLabel(seg),
  }));

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.length === 0 ? (
            <BreadcrumbItem>
              <BreadcrumbPage>ダッシュボード</BreadcrumbPage>
            </BreadcrumbItem>
          ) : (
            <>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink asChild>
                  <Link href="/">ダッシュボード</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              {crumbs.map((crumb, i) => (
                <React.Fragment key={crumb.href}>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    {i === crumbs.length - 1 ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link href={crumb.href}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </React.Fragment>
              ))}
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
    </header>
  );
}
