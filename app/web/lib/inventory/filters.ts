import type { InventoryFilterRow, InventoryFilters } from "@/lib/inventory/types";
import { matchesAgingFilter } from "@/lib/inventory/aging";

export function normalizeInventoryText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").toLowerCase().trim();
}

export function deriveSetCode(row: Pick<InventoryFilterRow, "set_code" | "serial_number">): string {
  if (row.set_code && row.set_code.length > 0) return row.set_code;
  return row.serial_number.split("_")[0] ?? "";
}

export function filterInventoryRows<T extends InventoryFilterRow>(
  rows: T[],
  filters: InventoryFilters
): T[] {
  const qNeedle = normalizeInventoryText(filters.q);
  const setNeedle = normalizeInventoryText(filters.set);
  const conditionNeedle = normalizeInventoryText(filters.condition);
  const statusNeedle = normalizeInventoryText(filters.status);

  return rows.filter((row) => {
    if (qNeedle) {
      const haystack = [
        normalizeInventoryText(row.name_ja),
        normalizeInventoryText(row.serial_number),
        normalizeInventoryText(deriveSetCode(row)),
      ];
      if (!haystack.some((value) => value.includes(qNeedle))) return false;
    }

    if (setNeedle && normalizeInventoryText(deriveSetCode(row)) !== setNeedle) return false;
    if (conditionNeedle && normalizeInventoryText(row.condition_grade) !== conditionNeedle) return false;
    if (filters.type && row.type !== filters.type) return false;
    if (statusNeedle && normalizeInventoryText(row.status) !== statusNeedle) return false;
    if (!matchesAgingFilter(row, filters.aging)) return false;

    return true;
  });
}

export function buildInventoryFilterOptions<T extends InventoryFilterRow>(rows: T[]) {
  const setOptions = Array.from(
    new Set(rows.map((row) => deriveSetCode(row)).filter((value) => value.length > 0))
  ).sort((a, b) => a.localeCompare(b, "ja"));

  const conditionOptions = Array.from(
    new Set(rows.map((row) => row.condition_grade).filter((value) => value.length > 0))
  ).sort((a, b) => a.localeCompare(b, "ja"));

  const statusOptions = Array.from(
    new Set(rows.map((row) => row.status).filter((value) => value.length > 0))
  ).sort((a, b) => a.localeCompare(b, "ja"));

  return { setOptions, conditionOptions, statusOptions };
}
