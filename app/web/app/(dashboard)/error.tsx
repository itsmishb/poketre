"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("dashboard error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-lg text-center">
        <p className="text-sm font-medium text-red-600">エラーが発生しました</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          ページの読み込みに失敗しました
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          一時的な問題が発生した可能性があります。再読み込みすると復旧する場合があります。
          解決しない場合は、少し時間をおいてから再度お試しください。
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-slate-400">
            参照ID: {error.digest}
          </p>
        )}
        {process.env.NODE_ENV !== "production" && (
          <details className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-left text-xs">
            <summary className="cursor-pointer text-slate-600">エラー詳細（開発用）</summary>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-slate-700">
              {error.message}
            </pre>
          </details>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            再試行
          </button>
          <Link
            href="/"
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ダッシュボードに戻る
          </Link>
        </div>
      </div>
    </div>
  );
}
