export default function ShopifyLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
      <div className="h-4 w-80 max-w-full animate-pulse rounded bg-slate-100" />
      <div className="mt-6 h-64 animate-pulse rounded-lg border border-slate-200 bg-white" />
      <div className="mt-6 h-40 animate-pulse rounded-lg border border-slate-200 bg-white" />
      <span className="sr-only">Shopify 設定を読み込み中…</span>
    </div>
  );
}
