"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = {
  value: string;
  label: string;
};

type InventoryFilterToolbarProps = {
  initialQuery: string;
  initialSet: string;
  initialCondition: string;
  initialType: string;
  initialStatus: string;
  initialAging: string;
  setOptions: Option[];
  conditionOptions: Option[];
  statusOptions: Option[];
};

function clean(v: string): string {
  return v.trim();
}

export function InventoryFilterToolbar({
  initialQuery,
  initialSet,
  initialCondition,
  initialType,
  initialStatus,
  initialAging,
  setOptions,
  conditionOptions,
  statusOptions,
}: InventoryFilterToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [queryDraft, setQueryDraft] = useState(initialQuery);
  useEffect(() => {
    setQueryDraft(initialQuery);
  }, [initialQuery]);

  const baseParams = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  function applyPatch(patch: Partial<Record<"q" | "set" | "condition" | "type" | "status" | "aging", string>>) {
    const next = new URLSearchParams(baseParams.toString());
    for (const [k, raw] of Object.entries(patch)) {
      const v = clean(raw ?? "");
      if (v.length > 0) next.set(k, v);
      else next.delete(k);
    }
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="mt-5 rounded-xl border bg-card p-3 md:p-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
        <form
          className="sm:col-span-2 lg:col-span-2"
          onSubmit={(e) => {
            e.preventDefault();
            applyPatch({ q: queryDraft });
          }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={queryDraft}
              onChange={(e) => setQueryDraft(e.target.value)}
              placeholder="カード名・識別子・セット記号で検索"
              className="pl-9"
            />
          </div>
        </form>

        <Select value={initialSet || "__all__"} onValueChange={(v) => applyPatch({ set: v === "__all__" ? "" : v })}>
          <SelectTrigger>
            <SelectValue placeholder="セット" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全セット</SelectItem>
            {setOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={initialCondition || "__all__"}
          onValueChange={(v) => applyPatch({ condition: v === "__all__" ? "" : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="コンディション" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全コンディション</SelectItem>
            {conditionOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={initialType || "__all__"} onValueChange={(v) => applyPatch({ type: v === "__all__" ? "" : v })}>
          <SelectTrigger>
            <SelectValue placeholder="管理単位" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全管理単位</SelectItem>
            <SelectItem value="UNIT">1枚</SelectItem>
            <SelectItem value="LOT">ロット</SelectItem>
          </SelectContent>
        </Select>

        <Select value={initialStatus || "__all__"} onValueChange={(v) => applyPatch({ status: v === "__all__" ? "" : v })}>
          <SelectTrigger>
            <SelectValue placeholder="在庫状態" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全状態</SelectItem>
            {statusOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={initialAging || "__all__"} onValueChange={(v) => applyPatch({ aging: v === "__all__" ? "" : v })}>
          <SelectTrigger>
            <SelectValue placeholder="在庫日数" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">全在庫日数</SelectItem>
            <SelectItem value="over90">90日以上</SelectItem>
            <SelectItem value="over180">180日以上</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button type="button" onClick={() => applyPatch({ q: queryDraft })}>
          検索
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/inventory">
            <RotateCcw className="mr-1 size-4" />
            Reset
          </Link>
        </Button>
      </div>
    </div>
  );
}
