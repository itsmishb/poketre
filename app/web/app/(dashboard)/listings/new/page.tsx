import Link from "next/link";
import { isDemoMode } from "@/lib/demo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "新規出品 | カード管理システム",
};

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ serial?: string }>;
}) {
  const sp = await searchParams;
  const serial =
    typeof sp.serial === "string" && sp.serial.length > 0 ? sp.serial : undefined;
  const isDemo = isDemoMode;

  return (
    <div>
      <div className="mb-4">
        <Link
          href={serial ? `/listings?serial=${encodeURIComponent(serial)}` : "/listings"}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          ← 出品一覧へ
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">新規出品</h1>
      <p className="mt-1 text-slate-600">
        チャネルを選び、対象在庫・価格を入力して出品します。
      </p>

      {serial && (
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm text-blue-900">
          対象カード識別子: <strong className="font-mono">{serial}</strong>
          <div className="mt-2">
            <Link href={`/inventory?serial=${encodeURIComponent(serial)}`} className="font-medium underline">
              在庫を確認
            </Link>
          </div>
        </div>
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>出品内容</CardTitle>
        </CardHeader>
        <CardContent>
        <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">
            {isDemo
              ? "この画面はデモモードのため入力できません。"
              : "この画面の保存処理は未接続のため入力できません。"}
          </p>
          <p className="mt-1">
            次の一手: Shopify 連携設定と出品 API 連携を有効化後に利用できます。
            <Link href="/settings/shopify" className="ml-1 underline">
              Shopify 設定を開く
            </Link>
          </p>
        </div>
        <form className="mt-4 max-w-md space-y-4">
          <div>
            <label htmlFor="channel" className="block text-sm font-medium text-slate-700">
              チャネル
            </label>
            <select
              id="channel"
              name="channel"
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 shadow-sm"
              disabled
            >
              <option value="SHOPIFY">Shopify</option>
              <option value="YAHOO_AUCTION">ヤフオク</option>
              <option value="MERCARI">メルカリ</option>
              <option value="OTHER">その他</option>
            </select>
          </div>
          <div>
            <label htmlFor="list_qty" className="block text-sm font-medium text-slate-700">
              出品数量
            </label>
            <input
              type="number"
              id="list_qty"
              name="list_qty"
              min={1}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 shadow-sm"
              placeholder="1"
              disabled
            />
          </div>
          <div>
            <label htmlFor="price" className="block text-sm font-medium text-slate-700">
              価格（円）
            </label>
            <input
              type="number"
              id="price"
              name="price"
              min={0}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 shadow-sm"
              placeholder="0"
              disabled
            />
          </div>
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-slate-700">
              出品タイトル
            </label>
            <input
              type="text"
              id="title"
              name="title"
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 shadow-sm"
              placeholder={serial ? `${serial} / 状態など` : "カード名 状態など"}
              disabled
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled>
              保存して出品
            </Button>
            <Button variant="secondary" asChild>
              <Link href={serial ? `/listings?serial=${encodeURIComponent(serial)}` : "/listings"}>
                キャンセル
              </Link>
            </Button>
          </div>
        </form>
        </CardContent>
      </Card>
    </div>
  );
}
