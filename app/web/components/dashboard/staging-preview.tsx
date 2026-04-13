import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CreditCard } from "lucide-react";
import type { DemoStagingRow } from "@/lib/demo-data";

type StagingItem = Pick<
  DemoStagingRow,
  "id" | "name_ja" | "set_code" | "rarity" | "image_url" | "card_number_text"
>;

export function StagingPreview({ items }: { items: StagingItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold text-foreground">登録待ち — 要確認</h3>
        <Link
          href="/staging"
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          すべて見る
          <ArrowRight className="size-3" />
        </Link>
      </div>

      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-4 px-5 py-3">
            {/* サムネイル */}
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
              {item.image_url ? (
                <Image
                  src={item.image_url}
                  alt={item.name_ja}
                  width={48}
                  height={48}
                  className="h-full w-full object-cover"
                />
              ) : (
                <CreditCard className="size-5 text-muted-foreground/50" />
              )}
            </div>

            {/* カード情報 */}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{item.name_ja}</p>
              <p className="text-xs text-muted-foreground">
                {item.set_code}
                {item.card_number_text ? ` — ${item.card_number_text}` : ""}
                {item.rarity ? ` — ${item.rarity}` : ""}
              </p>
            </div>

            {/* アクション */}
            <Link
              href={`/staging/${item.id}`}
              className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              確認する
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
