"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("global error:", error);
  }, [error]);

  return (
    <html lang="ja">
      <body>
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
          <div className="max-w-lg text-center">
            <h1 className="text-2xl font-bold text-slate-900">
              予期しないエラーが発生しました
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              アプリケーション全体で問題が発生しました。再読み込みして復旧をお試しください。
            </p>
            {error.digest && (
              <p className="mt-3 font-mono text-xs text-slate-400">
                参照ID: {error.digest}
              </p>
            )}
            <button
              type="button"
              onClick={() => reset()}
              className="mt-6 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              再試行
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
