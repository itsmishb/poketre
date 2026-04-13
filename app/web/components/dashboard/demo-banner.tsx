"use client";

import { isDemoMode } from "@/lib/demo";

export function DemoBanner() {
  if (!isDemoMode) return null;

  return (
    <div
      className="bg-amber-100 py-2 text-center text-sm text-amber-900"
      role="status"
    >
      デモモード（Supabase 未接続） — 接続なしで画面の確認ができます
    </div>
  );
}
