import type { InventoryFilterRow } from "@/lib/inventory/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function calculateAgingDays(acquiredAt: string | null | undefined, now = new Date()): number | null {
  if (!acquiredAt) return null;
  const date = new Date(acquiredAt);
  if (Number.isNaN(date.getTime())) return null;
  const diff = now.getTime() - date.getTime();
  return Math.max(0, Math.floor(diff / DAY_MS));
}

export function matchesAgingFilter(
  row: Pick<InventoryFilterRow, "acquired_at">,
  aging: "" | "over90" | "over180",
  now = new Date()
): boolean {
  if (!aging) return true;
  const days = calculateAgingDays(row.acquired_at, now);
  if (days == null) return false;
  if (aging === "over180") return days >= 180;
  return days >= 90;
}

export function agingBadgeTone(days: number | null): "muted" | "normal" | "amber" | "red" {
  if (days == null) return "muted";
  if (days >= 180) return "red";
  if (days >= 90) return "amber";
  if (days < 30) return "muted";
  return "normal";
}
