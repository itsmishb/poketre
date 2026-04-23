"use client";

import { useEffect, useState, useTransition } from "react";

type SettingsSnapshot = {
  shopDomain: string | null;
  apiVersion: string;
  locationId: string | null;
  hasAccessToken: boolean;
  hasWebhookSecret: boolean;
  lastConnectedAt: string | null;
  lastError: string | null;
};

type TestResult = {
  ok: boolean;
  shopName?: string;
  shopDomain?: string;
  locations?: Array<{ id: string; name: string }>;
  error?: string;
};

export function ShopifyForm({ initial }: { initial: SettingsSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [shopDomain, setShopDomain] = useState(initial.shopDomain ?? "");
  const [apiVersion, setApiVersion] = useState(initial.apiVersion);
  const [accessToken, setAccessToken] = useState("");
  const [locationId, setLocationId] = useState(initial.locationId ?? "");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    setSnapshot(initial);
  }, [initial]);

  const onSave = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/shopify/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopDomain: shopDomain || null,
          apiVersion,
          accessToken: accessToken === "" ? undefined : accessToken,
          locationId: locationId || null,
          webhookSecret: webhookSecret === "" ? undefined : webhookSecret,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "保存に失敗しました" }));
        setMessage({ kind: "err", text: err.error ?? "保存に失敗しました" });
        return;
      }
      setAccessToken("");
      setWebhookSecret("");
      const reloaded = await fetch("/api/shopify/settings").then((r) => r.json());
      setSnapshot(reloaded);
      setMessage({ kind: "ok", text: "保存しました。" });
    });
  };

  const onTest = () => {
    setTestResult(null);
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/shopify/test-connection", { method: "POST" });
      const data = (await res.json().catch(() => ({ ok: false, error: "parse error" }))) as TestResult;
      setTestResult(data);
    });
  };

  const onImportOrders = async () => {
    setMessage(null);
    setIsSyncing(true);
    try {
      const res = await fetch("/api/shopify/import-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ kind: "err", text: data.error ?? "注文取込ジョブの投入に失敗しました" });
        return;
      }
      setMessage({
        kind: "ok",
        text: `注文取込ジョブ #${data.jobId} をキューに投入しました。ワーカーが実行します。`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const onSyncAll = async (jobType: "UPSERT_PRODUCT" | "UPDATE_INVENTORY") => {
    setMessage(null);
    setIsSyncing(true);
    try {
      const res = await fetch("/api/shopify/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, jobType }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ kind: "err", text: data.error ?? "同期キュー投入に失敗しました" });
        return;
      }
      setMessage({
        kind: "ok",
        text: `${data.queued} 件のジョブをキューに投入しました。ワーカーが順次処理します。`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">接続設定</h2>
        <p className="mt-1 text-sm text-slate-600">
          アクセストークンと Webhook Secret は AES-256-GCM で暗号化して保存されます。空欄のまま保存すると既存値は維持されます。
        </p>

        <div className="mt-5 grid gap-4 sm:max-w-xl">
          <Field label="Store URL（例: your-store.myshopify.com）">
            <input
              type="text"
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              placeholder="your-store.myshopify.com"
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </Field>

          <Field label="API バージョン">
            <input
              type="text"
              value={apiVersion}
              onChange={(e) => setApiVersion(e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm"
            />
          </Field>

          <Field
            label="Admin API アクセストークン"
            hint={snapshot.hasAccessToken ? "保存済み（変更する場合のみ新しい値を入力）" : "未設定"}
          >
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={snapshot.hasAccessToken ? "••••••••（変更しない場合は空欄）" : "shpat_..."}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm"
            />
          </Field>

          <Field label="出荷ロケーション ID" hint="接続テストで候補を取得できます">
            <input
              type="text"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="例: 12345678901"
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm"
            />
          </Field>

          <Field
            label="Webhook Secret"
            hint={snapshot.hasWebhookSecret ? "保存済み" : "未設定（Webhook 検証に必要）"}
          >
            <input
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={snapshot.hasWebhookSecret ? "••••••••" : "Shopify webhook 署名用の secret"}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm"
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={isPending}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? "保存中..." : "保存"}
          </button>
          <button
            type="button"
            onClick={onTest}
            disabled={isPending || !snapshot.hasAccessToken}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            接続テスト
          </button>
          {snapshot.lastConnectedAt && (
            <span className="text-xs text-slate-500">
              最終接続: {new Date(snapshot.lastConnectedAt).toLocaleString("ja-JP")}
            </span>
          )}
        </div>

        {message && (
          <p
            className={`mt-4 rounded p-3 text-sm ${
              message.kind === "ok"
                ? "bg-green-50 text-green-800"
                : "bg-red-50 text-red-800"
            }`}
          >
            {message.text}
          </p>
        )}
        {snapshot.lastError && (
          <p className="mt-3 rounded bg-amber-50 p-3 text-xs text-amber-800">
            前回エラー: {snapshot.lastError}
          </p>
        )}

        {testResult && (
          <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-4">
            {testResult.ok ? (
              <>
                <p className="text-sm font-medium text-slate-900">
                  ✅ 接続成功: {testResult.shopName} ({testResult.shopDomain})
                </p>
                <p className="mt-3 text-xs font-medium text-slate-600">利用可能なロケーション:</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-700">
                  {testResult.locations?.map((loc) => (
                    <li key={loc.id}>
                      <button
                        type="button"
                        onClick={() => setLocationId(loc.id)}
                        className="underline hover:text-blue-600"
                      >
                        {loc.name}
                      </button>{" "}
                      <span className="text-xs text-slate-500">(id: {loc.id})</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-red-700">❌ 接続失敗: {testResult.error}</p>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-base font-semibold text-slate-900">手動同期</h2>
        <p className="mt-1 text-sm text-slate-600">
          ボタンを押すと <code className="rounded bg-slate-100 px-1">shopify_sync_jobs</code> にジョブを投入します。ワーカー
          （<code className="rounded bg-slate-100 px-1">POST /api/shopify/process-job</code>）が順次処理します。
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!snapshot.hasAccessToken || !snapshot.locationId || isSyncing}
            onClick={() => onSyncAll("UPSERT_PRODUCT")}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            商品・在庫を同期（全出品）
          </button>
          <button
            type="button"
            disabled={!snapshot.hasAccessToken || !snapshot.locationId || isSyncing}
            onClick={() => onSyncAll("UPDATE_INVENTORY")}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            在庫数のみ再同期
          </button>
          <button
            type="button"
            disabled={!snapshot.hasAccessToken || isSyncing}
            onClick={onImportOrders}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            title="Webhook 取りこぼしの救済に使えます"
          >
            注文を取り込む（ポーリング）
          </button>
        </div>
        {(!snapshot.hasAccessToken || !snapshot.locationId) && (
          <p className="mt-3 text-xs text-amber-700">
            接続設定（トークン・ロケーション ID）を保存すると同期を開始できます。
          </p>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
