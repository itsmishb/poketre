import Link from "next/link";
import { ChevronRight, Package, ScanLine, Tag } from "lucide-react";

type Action = {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
};

const ACTIONS: Action[] = [
  {
    href: "/staging/import",
    icon: ScanLine,
    title: "画像をスキャン登録",
    description: "カード画像からOCRで自動登録",
  },
  {
    href: "/inventory",
    icon: Package,
    title: "在庫を確認する",
    description: "現在の在庫・保管場所を確認",
  },
  {
    href: "/listings/new",
    icon: Tag,
    title: "出品を作成する",
    description: "Shopify・フリマへ新規出品",
  },
];

export function QuickActions() {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">クイックアクション</h3>
      <div className="mt-4 space-y-2">
        {ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm transition-colors hover:bg-accent"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <action.icon className="size-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{action.title}</p>
              <p className="text-xs text-muted-foreground">{action.description}</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
