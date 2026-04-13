import Link from "next/link";
import { isDemoMode } from "@/lib/demo";

export const metadata = {
  title: "Shopify 連携 | カード管理システム",
};

export default function ShopifySettingsPage() {
  const isDemo = isDemoMode;

  return (
    <div>
      <div className="mb-4">
        <Link href="/settings" className="text-sm font-medium text-blue-600 hover:underline">
          ← 設定へ
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Shopify 連携</h1>
      <p className="mt-1 text-slate-600">
        商品・在庫・出品状態の同期と、紹介文などのデータ設計のメモです。
      </p>

      <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/80 p-5 text-sm text-blue-950">
        <h2 className="font-semibold text-blue-900">いまの実装状況</h2>
        <p className="mt-2 leading-relaxed">
          このアプリから <strong>Shopify Admin API を実際に呼び出す処理はまだありません</strong>
          （出品の新規登録・公開停止・一時停止などのボタンはプレースホルダです）。
          Postgres 側には <code className="rounded bg-white/80 px-1">listings</code>・
          <code className="rounded bg-white/80 px-1">shopify_products</code>・
          <code className="rounded bg-white/80 px-1">shopify_sync_jobs</code> があり、
          連携ロジックを足せば載せられます。
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Shopify で「やりたいこと」と API の対応（実装時）</h2>
        <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-slate-700">
          <li>
            <strong>出品（商品作成）</strong> — Admin REST / GraphQL の{" "}
            <span className="font-mono text-xs">Product</span> 作成。バリアント・在庫アイテムと紐付け。
          </li>
          <li>
            <strong>公開 / 非公開（いわゆる停止に近い）</strong> —{" "}
            <span className="font-mono text-xs">published</span> や Publication API で販売チャネルへの掲載を切る、または{" "}
            <span className="font-mono text-xs">status: draft</span> 相当の扱い。
          </li>
          <li>
            <strong>在庫数の同期</strong> —{" "}
            <span className="font-mono text-xs">InventoryLevel</span> 更新（ロケーションとアイテム ID が必要）。
          </li>
          <li>
            <strong>注文取り込み</strong> — Webhook（<span className="font-mono text-xs">orders/*</span>
            ）またはポーリング。スキーマ上は <code className="rounded bg-slate-100 px-1">orders</code> あり。
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          細かな「一時停止」がアプリ内ステータスと Shopify のどちらを正とするかは、運用に合わせて{" "}
          <code className="rounded bg-slate-100 px-1">listings.status</code>（DRAFT / LISTED / ENDED 等）と同期方針を決めるとよいです。
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">紹介文・商品説明をデータで持つ</h2>
        <dl className="mt-3 space-y-3 text-sm text-slate-700">
          <div>
            <dt className="font-medium text-slate-800">チャネル別の一行（出品ライン）</dt>
            <dd className="mt-1">
              テーブル <code className="rounded bg-slate-100 px-1">listings</code> の{" "}
              <code className="rounded bg-slate-100 px-1">listing_title</code>・
              <code className="rounded bg-slate-100 px-1">listing_description</code>
              （必要なら <code className="rounded bg-slate-100 px-1">listing_image_urls</code>
              ）。Shopify / メルカリ等で文言が違う場合はここで分けます。
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-800">カード共通のたたき台（マスタ）</dt>
            <dd className="mt-1">
              マイグレーション{" "}
              <code className="rounded bg-slate-100 px-1">000003_card_public_description</code> で{" "}
              <code className="rounded bg-slate-100 px-1">cards.public_description_ja</code>{" "}
              を追加。全チャネルで流用する紹介文の素を置けます。出品作成時に{" "}
              <code className="rounded bg-slate-100 px-1">listings</code> へコピーして編集、という流れが取りやすいです。
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-800">AI で下書き（Vertex AI / Gemini）</dt>
            <dd className="mt-1 space-y-2">
              <p>
                API{" "}
                <code className="rounded bg-slate-100 px-1">POST /api/ai/draft-listing-description</code>
                （JSON: <code className="rounded bg-slate-100 px-1">name_ja</code> 必須、その他{" "}
                <code className="rounded bg-slate-100 px-1">set_code</code>・
                <code className="rounded bg-slate-100 px-1">rarity</code>・
                <code className="rounded bg-slate-100 px-1">condition_grade</code>・
                <code className="rounded bg-slate-100 px-1">card_number_text</code>）。
              </p>
              <p>
                必要な環境変数: <code className="rounded bg-slate-100 px-1">GOOGLE_CLOUD_PROJECT</code>、
                <code className="rounded bg-slate-100 px-1">VERTEX_LOCATION</code>（または{" "}
                <code className="rounded bg-slate-100 px-1">GOOGLE_CLOUD_LOCATION</code>）。
                認証は ADC（ローカル）または{" "}
                <code className="rounded bg-slate-100 px-1">GCP_SERVICE_ACCOUNT_JSON</code>（サーバーレス）。
                任意で <code className="rounded bg-slate-100 px-1">GEMINI_MODEL</code>。
                プロジェクト未設定時は 503。本番では認証・レート制限・ログ方針を必ず足してください。
              </p>
            </dd>
          </div>
        </dl>
      </div>

      <div className="mt-8 space-y-6">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-medium text-slate-500">連携設定</h2>
          <p className="mt-2 text-sm text-slate-600">
            Store URL・Admin API アクセストークンは環境変数または暗号化して DB に保存する設計を推奨しています。
          </p>
          <form className="mt-4 max-w-md space-y-4">
            <div>
              <label htmlFor="store_url" className="block text-sm font-medium text-slate-700">
                Store URL
              </label>
              <input
                type="url"
                id="store_url"
                name="store_url"
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 shadow-sm"
                placeholder="https://your-store.myshopify.com"
                disabled
              />
            </div>
            <div>
              <label htmlFor="api_token" className="block text-sm font-medium text-slate-700">
                Admin API アクセストークン
              </label>
              <input
                type="password"
                id="api_token"
                name="api_token"
                className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-slate-900 shadow-sm"
                placeholder="••••••••"
                disabled
              />
            </div>
            <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">
              {isDemo
                ? "デモモードでは設定の保存は行えません。"
                : "このフォームの保存処理は未接続のため、現在は編集できません。"}
              必要情報の入力後、API 連携を有効化すると保存できる想定です。
            </p>
            <button
              type="button"
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled
            >
              保存
            </button>
          </form>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-medium text-slate-500">手動同期（未接続）</h2>
          <p className="mt-2 rounded bg-amber-50 p-3 text-sm text-amber-800">
            同期 API が未接続のため、ボタンは無効化されています。連携実装後に有効になります。
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              disabled
            >
              商品・在庫を同期
            </button>
            <button
              type="button"
              className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              disabled
            >
              注文を取り込む
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            実装時は Server Action または API Route から Shopify Admin API を呼び、結果を{" "}
            <code className="rounded bg-slate-100 px-1">shopify_sync_jobs</code> /{" "}
            <code className="rounded bg-slate-100 px-1">sync_jobs</code> に記録する想定です。
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-medium text-slate-500">SyncJobs ログ</h2>
          <p className="mt-2 text-sm text-slate-600">
            直近の同期ジョブは <code className="rounded bg-slate-100 px-1">shopify_sync_jobs</code> /{" "}
            <code className="rounded bg-slate-100 px-1">sync_jobs</code> 連携後にここへ表示できます。
          </p>
        </div>
      </div>
    </div>
  );
}
