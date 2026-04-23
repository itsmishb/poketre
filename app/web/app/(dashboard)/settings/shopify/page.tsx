import Link from "next/link";
import { getShopifySettings } from "@/lib/shopify/settings";
import { getPool } from "@/lib/db/pool";
import { isDatabaseConfigured } from "@/lib/server-data";
import { ShopifyForm } from "./shopify-form";

export const metadata = {
  title: "Shopify 連携 | カード管理システム",
};

export const dynamic = "force-dynamic";

type JobRow = {
  job_id: number;
  job_type: string;
  card_id: string | null;
  status: string;
  attempt: number;
  last_error: string | null;
  updated_at: Date;
};

async function recentJobs(): Promise<JobRow[]> {
  if (!isDatabaseConfigured()) return [];
  const pool = getPool();
  const { rows } = await pool.query<JobRow>(
    `SELECT job_id, job_type, card_id, status, attempt, last_error, updated_at
       FROM shopify_sync_jobs
      ORDER BY updated_at DESC
      LIMIT 20`
  );
  return rows;
}

export default async function ShopifySettingsPage() {
  const dbReady = isDatabaseConfigured();
  const settings = dbReady
    ? await getShopifySettings()
    : {
        shopDomain: null,
        apiVersion: "2025-01",
        accessToken: null,
        locationId: null,
        webhookSecret: null,
        lastConnectedAt: null,
        lastError: null,
      };
  const jobs = await recentJobs();

  const snapshot = {
    shopDomain: settings.shopDomain,
    apiVersion: settings.apiVersion,
    locationId: settings.locationId?.toString() ?? null,
    hasAccessToken: Boolean(settings.accessToken),
    hasWebhookSecret: Boolean(settings.webhookSecret),
    lastConnectedAt: settings.lastConnectedAt ? settings.lastConnectedAt.toISOString() : null,
    lastError: settings.lastError,
  };

  return (
    <div>
      <div className="mb-4">
        <Link href="/settings" className="text-sm font-medium text-blue-600 hover:underline">
          ← 設定へ
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-slate-900">Shopify 連携</h1>
      <p className="mt-1 text-slate-600">
        商品・在庫の同期、Webhook 経由の注文取り込みを行います（Phase A: 1 カード = 1 バリアント）。
      </p>

      {!dbReady && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          DATABASE_URL が未設定のため、設定の読み書きができません。
        </div>
      )}

      <div className="mt-6">
        <ShopifyForm initial={snapshot} />
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">直近の同期ジョブ</h2>
        {jobs.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">ジョブ履歴はまだありません。</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="py-2 pr-4">ID</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Card</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Attempt</th>
                  <th className="py-2 pr-4">Updated</th>
                  <th className="py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <tr key={j.job_id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-mono text-xs text-slate-600">{j.job_id}</td>
                    <td className="py-2 pr-4 text-slate-700">{j.job_type}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-600">{j.card_id ?? "-"}</td>
                    <td className="py-2 pr-4">
                      <span className={statusBadge(j.status)}>{j.status}</span>
                    </td>
                    <td className="py-2 pr-4 text-slate-600">{j.attempt}</td>
                    <td className="py-2 pr-4 text-xs text-slate-500">
                      {new Date(j.updated_at).toLocaleString("ja-JP")}
                    </td>
                    <td className="py-2 text-xs text-red-700">{j.last_error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-700">
        <h2 className="font-semibold text-slate-900">Webhook 設定方法</h2>
        <p className="mt-2">
          Shopify 管理画面 → Settings → Notifications → Webhooks で以下のエンドポイントを登録:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1 font-mono text-xs">
          <li>POST https://&lt;your-domain&gt;/api/shopify/webhooks/orders.create</li>
          <li>POST https://&lt;your-domain&gt;/api/shopify/webhooks/orders.paid</li>
          <li>POST https://&lt;your-domain&gt;/api/shopify/webhooks/orders.updated</li>
        </ul>
        <p className="mt-2 text-xs">
          登録時に表示される secret を上のフォームの「Webhook Secret」に保存してください。
        </p>
      </div>
    </div>
  );
}

function statusBadge(status: string): string {
  const base = "inline-flex rounded px-2 py-0.5 text-xs font-medium";
  switch (status) {
    case "SUCCEEDED":
      return `${base} bg-green-100 text-green-800`;
    case "FAILED":
      return `${base} bg-red-100 text-red-800`;
    case "RUNNING":
      return `${base} bg-blue-100 text-blue-800`;
    case "RETRY":
      return `${base} bg-amber-100 text-amber-800`;
    default:
      return `${base} bg-slate-100 text-slate-700`;
  }
}
