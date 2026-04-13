import Link from "next/link";

export const metadata = {
  title: "設定 | カード管理システム",
};

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">設定</h1>
      <p className="mt-1 text-slate-600">
        連携やシステムの設定を行います。
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/settings/shopify"
          className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm hover:border-blue-300 hover:shadow"
        >
          <h2 className="font-semibold text-slate-800">Shopify 連携</h2>
          <p className="mt-1 text-sm text-slate-600">
            商品・在庫の同期、注文の取り込み設定と実行ログ
          </p>
        </Link>
      </div>
    </div>
  );
}
