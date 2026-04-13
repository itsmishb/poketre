import Link from "next/link";
import { CreditCard } from "lucide-react";

type CardGridRow = {
  id: string;
  serial_number: string;
  name_ja: string;
  set_code: string;
  card_number: string;
  rarity: string;
  card_type: string;
  stock_count?: number;
  listed_count?: number;
};

// レアリティに応じたグラデーション
const RARITY_GRADIENT: Record<string, string> = {
  コモン:       "from-slate-400  to-slate-600",
  アンコモン:   "from-teal-400   to-teal-600",
  レア:         "from-amber-400  to-amber-600",
  二レア:       "from-orange-400 to-orange-600",
  SR:           "from-violet-500 to-violet-700",
  SAR:          "from-purple-500 to-purple-700",
  HR:           "from-rose-500   to-rose-700",
  UR:           "from-red-500    to-red-700",
  RR:           "from-blue-500   to-blue-700",
};

function getRarityGradient(rarity: string): string {
  for (const [key, cls] of Object.entries(RARITY_GRADIENT)) {
    if (rarity.includes(key)) return cls;
  }
  return "from-slate-400 to-slate-600";
}

// レアリティバッジ色
const RARITY_BADGE: Record<string, string> = {
  コモン:       "bg-slate-100 text-slate-700",
  アンコモン:   "bg-teal-100  text-teal-700",
  レア:         "bg-amber-100 text-amber-800",
  二レア:       "bg-orange-100 text-orange-800",
  SR:           "bg-violet-100 text-violet-700",
  SAR:          "bg-purple-100 text-purple-700",
  HR:           "bg-rose-100   text-rose-700",
  UR:           "bg-red-100    text-red-700",
};

function getRarityBadgeClass(rarity: string): string {
  for (const [key, cls] of Object.entries(RARITY_BADGE)) {
    if (rarity.includes(key)) return cls;
  }
  return "bg-slate-100 text-slate-700";
}

export function CardGrid({ rows }: { rows: CardGridRow[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {rows.map((card) => (
        <Link
          key={card.id}
          href={`/cards/${card.id}`}
          className="group block overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
        >
          {/* カードイメージ（プレースホルダー） */}
          <div
            className={`relative flex aspect-[3/4] items-center justify-center bg-gradient-to-br ${getRarityGradient(card.rarity)}`}
          >
            <CreditCard className="size-10 text-white/30" />
            {/* セットコードバッジ */}
            <span className="absolute left-2 top-2 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white/90">
              {card.set_code}
            </span>
            {/* 在庫バッジ */}
            {(card.stock_count ?? 0) > 0 && (
              <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white">
                在庫 {card.stock_count}
              </span>
            )}
          </div>

          {/* カード情報 */}
          <div className="space-y-1.5 p-2.5">
            <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">
              {card.name_ja}
            </p>
            <div className="flex items-center justify-between gap-1">
              <span
                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${getRarityBadgeClass(card.rarity)}`}
              >
                {card.rarity}
              </span>
              <span className="truncate text-[10px] text-muted-foreground">
                {card.card_number}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
