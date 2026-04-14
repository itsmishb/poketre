"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type BatchStatus = {
  batch_id: string;
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  completed: boolean;
};

const STORAGE_KEY = "pendingBatches";

function readPendingBatches(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function clearPendingBatches() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // sessionStorage unavailable（Safari プライベートモード等）
  }
}

/**
 * OCR バッチ処理の進捗をポーリングして表示するコンポーネント。
 *
 * sessionStorage の "pendingBatches" キーを読み取り、
 * 5 秒間隔で /api/staging/batch-status をポーリングする。
 * 全バッチ完了時に sessionStorage をクリアしてページをリフレッシュ。
 */
export function BatchProgress() {
  const router = useRouter();
  const [progress, setProgress] = useState<BatchStatus[]>([]);

  useEffect(() => {
    const saved = readPendingBatches();
    if (saved.length === 0) return;

    const poll = async () => {
      try {
        const params = new URLSearchParams({ batch_ids: saved.join(",") });
        const res = await fetch(`/api/staging/batch-status?${params.toString()}`);
        if (!res.ok) return;
        const { batches } = (await res.json()) as { batches: BatchStatus[] };
        setProgress(batches);

        const allDone = batches.length > 0 && batches.every((b) => b.completed);
        if (allDone) {
          clearPendingBatches();
          router.refresh();
        }
      } catch {
        // ネットワークエラーはサイレントに無視（次のポーリングで再試行）
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [router]);

  const pending = progress.filter((b) => !b.completed);
  if (pending.length === 0) return null;

  const total     = pending.reduce((s, b) => s + b.total, 0);
  const succeeded = pending.reduce((s, b) => s + b.succeeded, 0);
  const failed    = pending.reduce((s, b) => s + b.failed, 0);
  const pct = total > 0 ? Math.round((succeeded / total) * 100) : 0;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3" role="status" aria-live="polite">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-primary">
          OCR 処理中: {succeeded}/{total} 件完了
          {failed > 0 && (
            <span className="ml-2 text-destructive text-xs">({failed} 件失敗)</span>
          )}
        </span>
        <span className="text-xs text-muted-foreground" aria-hidden="true">{pct}%</span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/20"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`OCR 処理進捗 ${pct}%`}
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
