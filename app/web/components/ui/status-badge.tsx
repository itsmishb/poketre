/**
 * StatusBadge — ステータス種別に応じた色付きバッジ
 * shadcn/ui Badge コンポーネントをベースに、プロジェクト固有のステータスカラーを追加。
 */
import { cn } from "@/lib/utils";

export type StatusKind =
  | "listingStatus"
  | "syncStatus"
  | "importStatus"
  | "stockStatus"
  | "ocrStatus"
  | "duplicateStatus"
  | "generic";

type Tone = "slate" | "blue" | "green" | "amber" | "red" | "purple";

const toneClass: Record<Tone, string> = {
  slate:  "border-transparent bg-slate-100 text-slate-700",
  blue:   "border-transparent bg-blue-100 text-blue-700",
  green:  "border-transparent bg-emerald-100 text-emerald-700",
  amber:  "border-transparent bg-amber-100 text-amber-800",
  red:    "border-transparent bg-red-100 text-red-700",
  purple: "border-transparent bg-purple-100 text-purple-700",
};

const kindToneMap: Record<Exclude<StatusKind, "generic">, Record<string, Tone>> = {
  ocrStatus: {
    SUCCEEDED: "green",
    "完了":    "green",
    RUNNING:   "blue",
    "実行中":  "blue",
    "OCR中":   "blue",
    PENDING:   "slate",
    "待機中":  "slate",
    FAILED:    "red",
    "失敗":    "red",
    "OCR失敗": "red",
  },
  duplicateStatus: {
    NONE:      "slate",
    "なし":    "slate",
    CANDIDATE: "amber",
    "候補あり": "amber",
    RESOLVED:  "green",
    "解決済":  "green",
  },
  listingStatus: {
    LISTED:   "green",
    "出品中":  "green",
    DRAFT:    "slate",
    "下書き":  "slate",
    SOLD:     "amber",
    "売却済":  "amber",
    ENDED:    "amber",
    "終了":    "amber",
    SYNC_ERROR: "red",
    "エラー":  "red",
  },
  syncStatus: {
    "同期済":   "green",
    SUCCEEDED: "green",
    SUCCESS:   "green",
    "手動管理": "purple",
    PENDING:   "purple",
    QUEUED:    "purple",
    FAILED:    "red",
    ERROR:     "red",
  },
  importStatus: {
    "取り込み済": "green",
    IMPORTED:   "green",
    SUCCEEDED:  "green",
    "手動登録":  "amber",
    PENDING:    "amber",
    FAILED:     "red",
    ERROR:      "red",
  },
  stockStatus: {
    "在庫":   "green",
    IN_STOCK: "green",
    LISTED:   "green",
    RESERVED: "amber",
    HOLD:     "amber",
    SOLD:     "slate",
    SHIPPED:  "slate",
  },
};

function normalizeStatusKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function resolveTone(kind: StatusKind, value: string): Tone {
  if (kind === "generic") return "slate";
  const normalized = normalizeStatusKey(value);
  const map = kindToneMap[kind];
  return map[value] ?? map[normalized] ?? "slate";
}

export function StatusBadge({
  kind = "generic",
  value,
  className,
}: {
  kind?: StatusKind;
  value: string;
  className?: string;
}) {
  const tone = resolveTone(kind, value);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        toneClass[tone],
        className
      )}
    >
      {value}
    </span>
  );
}
