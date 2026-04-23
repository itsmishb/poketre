"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Settings2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { agingBadgeTone } from "@/lib/inventory/aging";
import type { InventorySortDir, InventorySortKey } from "@/lib/inventory/types";

const DENSITY_KEY = "inventory_table_density";
const COLUMNS_KEY = "inventory_table_columns_v1";

type Density = "compact" | "default" | "comfortable";

type InventoryTableRow = {
  id: string;
  serial_number: string;
  name_ja: string;
  condition_grade: string;
  qty: number;
  type: "UNIT" | "LOT";
  location_name: string;
  status: string;
  acquisition_cost: number | null;
  image_url?: string | null;
  aging_days: number | null;
};

type ColumnKey =
  | "thumbnail"
  | "serial"
  | "name"
  | "condition"
  | "qty"
  | "type"
  | "location"
  | "stock_status"
  | "aging_days"
  | "acquisition_cost"
  | "actions";

type ColumnConfig = {
  key: ColumnKey;
  label: string;
  className?: string;
  sortable?: InventorySortKey;
  required?: boolean;
};

const COLUMN_CONFIGS: ColumnConfig[] = [
  { key: "thumbnail", label: "画像" },
  { key: "serial", label: "カード識別子" },
  { key: "name", label: "カード名", sortable: "name", required: true },
  { key: "condition", label: "コンディション", sortable: "condition" },
  { key: "qty", label: "数量", className: "text-right", sortable: "qty" },
  { key: "type", label: "管理単位" },
  { key: "location", label: "保管場所" },
  { key: "stock_status", label: "在庫状態" },
  { key: "aging_days", label: "在庫日数", sortable: "aging_days" },
  { key: "acquisition_cost", label: "取得原価", className: "text-right", sortable: "acquisition_cost" },
  { key: "actions", label: "操作" },
];

const DEFAULT_COLUMNS: Record<ColumnKey, boolean> = {
  thumbnail: true,
  serial: true,
  name: true,
  condition: true,
  qty: true,
  type: true,
  location: true,
  stock_status: true,
  aging_days: true,
  acquisition_cost: true,
  actions: true,
};

function sortIcon(currentSort: InventorySortKey, currentDir: InventorySortDir, key: InventorySortKey) {
  if (currentSort !== key) return <ArrowUpDown className="size-3.5" />;
  if (currentDir === "asc") return <ArrowUp className="size-3.5" />;
  return <ArrowDown className="size-3.5" />;
}

function getAgingClass(days: number | null): string {
  const tone = agingBadgeTone(days);
  if (tone === "red") return "bg-red-100 text-red-700";
  if (tone === "amber") return "bg-amber-100 text-amber-800";
  if (tone === "muted") return "bg-slate-100 text-slate-500";
  return "bg-slate-200/70 text-slate-700";
}

export function InventoryTable({
  rows,
  sort,
  dir,
}: {
  rows: InventoryTableRow[];
  sort: InventorySortKey;
  dir: InventorySortDir;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [density, setDensity] = useState<Density>("default");
  const [columns, setColumns] = useState<Record<ColumnKey, boolean>>(DEFAULT_COLUMNS);

  useEffect(() => {
    try {
      const savedDensity = localStorage.getItem(DENSITY_KEY);
      if (savedDensity === "compact" || savedDensity === "default" || savedDensity === "comfortable") {
        setDensity(savedDensity);
      }
      const savedColumns = localStorage.getItem(COLUMNS_KEY);
      if (savedColumns) {
        const parsed = JSON.parse(savedColumns) as Partial<Record<ColumnKey, boolean>>;
        setColumns({ ...DEFAULT_COLUMNS, ...parsed, name: true });
      }
    } catch {
      // ignore storage parse errors
    }
  }, []);

  function updateDensity(next: Density) {
    setDensity(next);
    try {
      localStorage.setItem(DENSITY_KEY, next);
    } catch {
      // ignore storage errors
    }
  }

  function toggleColumn(key: ColumnKey) {
    if (key === "name") return;
    const next = { ...columns, [key]: !columns[key], name: true };
    setColumns(next);
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }

  function buildSortHref(key: InventorySortKey): string {
    const params = new URLSearchParams(searchParams.toString());
    const nextDir: InventorySortDir = sort === key && dir === "asc" ? "desc" : "asc";
    params.set("sort", key);
    params.set("dir", nextDir);
    return `${pathname}?${params.toString()}`;
  }

  const rowPaddingClass = useMemo(() => {
    if (density === "compact") return "py-1";
    if (density === "comfortable") return "py-3";
    return "py-2";
  }, [density]);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Settings2 className="size-4" />
              表示設定
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 p-3">
            <DropdownMenuLabel className="px-1">行密度</DropdownMenuLabel>
            <div className="space-y-1 px-1 py-1 text-sm">
              {([
                ["compact", "compact"],
                ["default", "default"],
                ["comfortable", "comfortable"],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="density"
                    checked={density === value}
                    onChange={() => updateDensity(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="px-1">表示列</DropdownMenuLabel>
            <div className="grid grid-cols-2 gap-1 px-1 py-1 text-sm">
              {COLUMN_CONFIGS.map((col) => (
                <label key={col.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={columns[col.key] || col.required === true}
                    disabled={col.required === true}
                    onChange={() => toggleColumn(col.key)}
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMN_CONFIGS.filter((col) => columns[col.key] || col.required).map((col) => (
                <TableHead key={col.key} className={col.className}>
                  {col.sortable ? (
                    <Link href={buildSortHref(col.sortable)} className="inline-flex items-center gap-1 hover:underline">
                      {col.label}
                      {sortIcon(sort, dir, col.sortable)}
                    </Link>
                  ) : (
                    col.label
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {(columns.thumbnail || false) && (
                  <TableCell className={cn("w-14", rowPaddingClass)}>
                    <div className="group relative h-14 w-10 overflow-visible">
                      {row.image_url ? (
                        <Image
                          src={row.image_url}
                          alt={row.name_ja}
                          fill
                          sizes="40px"
                          className="rounded border object-cover"
                        />
                      ) : (
                        <div className="h-full w-full rounded border bg-slate-100" />
                      )}
                      <div className="pointer-events-none absolute left-12 top-0 z-20 hidden rounded border bg-white p-1 shadow-xl group-hover:block">
                        <div className="relative h-[210px] w-[150px] overflow-hidden rounded">
                          {row.image_url ? (
                            <Image
                              src={row.image_url}
                              alt={`${row.name_ja} preview`}
                              fill
                              sizes="150px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="h-full w-full bg-slate-100" />
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                )}
                {(columns.serial || false) && (
                  <TableCell className={cn("font-medium", rowPaddingClass)}>{row.serial_number}</TableCell>
                )}
                <TableCell className={cn(rowPaddingClass)}>{row.name_ja}</TableCell>
                {(columns.condition || false) && (
                  <TableCell className={cn(rowPaddingClass)}>{row.condition_grade}</TableCell>
                )}
                {(columns.qty || false) && (
                  <TableCell className={cn("text-right", rowPaddingClass)}>{row.qty.toLocaleString()}</TableCell>
                )}
                {(columns.type || false) && (
                  <TableCell className={cn(rowPaddingClass)}>{row.type === "UNIT" ? "1枚" : "ロット"}</TableCell>
                )}
                {(columns.location || false) && (
                  <TableCell className={cn(rowPaddingClass)}>{row.location_name || "—"}</TableCell>
                )}
                {(columns.stock_status || false) && (
                  <TableCell className={cn(rowPaddingClass)}>
                    <StatusBadge kind="stockStatus" value={row.status} />
                  </TableCell>
                )}
                {(columns.aging_days || false) && (
                  <TableCell className={cn(rowPaddingClass)}>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", getAgingClass(row.aging_days))}>
                      {row.aging_days != null ? `${row.aging_days}日` : "—"}
                    </span>
                  </TableCell>
                )}
                {(columns.acquisition_cost || false) && (
                  <TableCell className={cn("text-right", rowPaddingClass)}>
                    {row.acquisition_cost != null ? `¥${row.acquisition_cost.toLocaleString()}` : "—"}
                  </TableCell>
                )}
                {(columns.actions || false) && (
                  <TableCell className={cn(rowPaddingClass)}>
                    <Link href={`/inventory/${row.id}`} className="text-sm font-medium text-primary hover:underline">
                      詳細
                    </Link>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
