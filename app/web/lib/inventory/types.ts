export type InventoryFilterRow = {
  id: string;
  type: "UNIT" | "LOT";
  serial_number: string;
  name_ja: string;
  set_code?: string;
  condition_grade: string;
  status: string;
  acquired_at?: string | null;
};

export type InventoryFilters = {
  q: string;
  set: string;
  condition: string;
  type: "" | "UNIT" | "LOT";
  status: string;
  aging: "" | "over90" | "over180";
};

export type InventorySortKey =
  | "name"
  | "condition"
  | "qty"
  | "acquisition_cost"
  | "aging_days";

export type InventorySortDir = "asc" | "desc";
