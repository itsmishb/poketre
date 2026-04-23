#!/usr/bin/env node
// Shopify ジョブワーカーのローカル / 開発用ポーリング。
// 本番は Cloud Scheduler などから直接 /api/shopify/process-job を叩くこと。
//
// 使い方:
//   APP_URL=http://localhost:3000 \
//   SHOPIFY_WORKER_SHARED_SECRET=... \
//   POLL_INTERVAL_MS=3000 \
//   node scripts/shopify-worker-loop.mjs

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const SECRET = process.env.SHOPIFY_WORKER_SHARED_SECRET ?? "";
const INTERVAL = Number(process.env.POLL_INTERVAL_MS ?? 3000);

let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
  console.log("\n[shopify-worker] received SIGINT, finishing current job...");
});

async function tick() {
  const res = await fetch(`${APP_URL}/api/shopify/process-job`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(SECRET ? { "x-shopify-worker-secret": SECRET } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (body.idle) return { idle: true };
  if (!res.ok) {
    console.error(`[shopify-worker] job ${body.jobId ?? "?"} failed:`, body.error);
  } else {
    console.log(`[shopify-worker] job ${body.jobId} ${body.jobType} → OK`);
  }
  return { idle: false };
}

(async () => {
  console.log(`[shopify-worker] polling ${APP_URL}/api/shopify/process-job every ${INTERVAL}ms`);
  while (!stopping) {
    try {
      const { idle } = await tick();
      await new Promise((r) => setTimeout(r, idle ? INTERVAL : 100));
    } catch (err) {
      console.error("[shopify-worker] tick error:", err);
      await new Promise((r) => setTimeout(r, INTERVAL));
    }
  }
  console.log("[shopify-worker] stopped");
})();
