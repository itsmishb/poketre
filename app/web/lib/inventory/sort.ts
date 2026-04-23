import { calculateAgingDays } from "@/lib/inventory/aging";
import type { InventorySortDir, InventorySortKey } from "@/lib/inventory/types";

type SortableRow = {
  name_ja: string;
  condition_grade: string;
  qty: number;
  acquisition_cost: number | null;
  acquired_at?: string | null;
};

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, "ja");
}

function compareNumbersNullable(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

export function normalizeSortKey(value: string | undefined): InventorySortKey {
  switch (value) {
    case "condition":
    case "qty":
    case "acquisition_cost":
    case "aging_days":
      return value;
    default:
      return "name";
  }
}

export function normalizeSortDir(value: string | undefined): InventorySortDir {
  return value === "desc" ? "desc" : "asc";
}

export function sortInventoryRows<T extends SortableRow>(
  rows: T[],
  sort: InventorySortKey,
  dir: InventorySortDir
): T[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    let applyDir = true;
    switch (sort) {
      case "condition":
        cmp = compareStrings(a.condition_grade, b.condition_grade);
        break;
      case "qty":
        cmp = a.qty - b.qty;
        break;
      case "acquisition_cost": {
        // null は常に末尾に寄せる
        cmp = compareNumbersNullable(a.acquisition_cost, b.acquisition_cost);
        applyDir = a.acquisition_cost != null && b.acquisition_cost != null;
        break;
      }
      case "aging_days": {
        const aDays = calculateAgingDays(a.acquired_at);
        const bDays = calculateAgingDays(b.acquired_at);
        cmp = compareNumbersNullable(aDays, bDays);
        applyDir = aDays != null && bDays != null;
        break;
      }
      case "name":
      default:
        cmp = compareStrings(a.name_ja, b.name_ja);
        break;
    }

    if (cmp !== 0) return applyDir ? cmp * mult : cmp;
    return compareStrings(a.name_ja, b.name_ja);
  });
}
