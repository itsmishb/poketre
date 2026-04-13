"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CreditCard,
  LayoutDashboard,
  Package,
  ScanLine,
  Settings2,
  ShoppingCart,
  Tag,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

// アイコン名 → コンポーネントのマップ（シリアライズ可能な文字列キーを使用）
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  ScanLine,
  CreditCard,
  BookOpen,
  Warehouse,
  Package,
  Tag,
  ShoppingCart,
  Settings2,
};

type NavItem = {
  href: string;
  label: string;
  iconKey: string;
  badgeKey?: string;
};

type NavGroup = {
  heading: string;
  items: NavItem[];
};

// データはシリアライズ可能なプリミティブのみ（アイコンは文字列キー）
const NAV_GROUPS: NavGroup[] = [
  {
    heading: "概要",
    items: [{ href: "/", label: "ダッシュボード", iconKey: "LayoutDashboard" }],
  },
  {
    heading: "受け入れ",
    items: [
      { href: "/staging", label: "登録待ち", iconKey: "ScanLine", badgeKey: "staging" },
    ],
  },
  {
    heading: "マスタ",
    items: [
      { href: "/cards",     label: "カード種別", iconKey: "CreditCard" },
      { href: "/sets",      label: "セット",     iconKey: "BookOpen"   },
      { href: "/locations", label: "棚番・保管", iconKey: "Warehouse"  },
    ],
  },
  {
    heading: "在庫・販売",
    items: [
      { href: "/inventory", label: "在庫", iconKey: "Package"      },
      { href: "/listings",  label: "出品", iconKey: "Tag"          },
      { href: "/orders",    label: "注文", iconKey: "ShoppingCart" },
    ],
  },
  {
    heading: "システム",
    items: [{ href: "/settings", label: "設定", iconKey: "Settings2" }],
  },
];

function pathMatches(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

type Badges = { staging?: number };

export function NavMain({ badges }: { badges?: Badges }) {
  const pathname = usePathname();

  return (
    <>
      {NAV_GROUPS.map((group) => (
        <SidebarGroup key={group.heading}>
          <SidebarGroupLabel>{group.heading}</SidebarGroupLabel>
          <SidebarMenu>
            {group.items.map((item) => {
              const isActive = pathMatches(pathname, item.href);
              const badge = item.badgeKey ? badges?.[item.badgeKey as keyof Badges] : undefined;
              const Icon = ICON_MAP[item.iconKey];
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                    <Link href={item.href}>
                      {Icon && <Icon />}
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                  {badge != null && badge > 0 && (
                    <SidebarMenuBadge>{badge}</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}
