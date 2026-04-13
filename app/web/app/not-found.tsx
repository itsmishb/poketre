import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <h1 className="text-2xl font-bold text-slate-900">ページが見つかりません</h1>
      <p className="mt-2 text-slate-600">
        お探しのページは存在しないか、移動した可能性があります。
      </p>
      <Link
        href="/"
        className="mt-6 rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
      >
        ダッシュボードへ
      </Link>
    </div>
  );
}
