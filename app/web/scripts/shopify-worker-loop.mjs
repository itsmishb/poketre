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

const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS ?? 30_000);

let stopping = false;
const stop = (sig) => {
  stopping = true;
  console.log(`\n[shopify-worker] received ${sig}, finishing current job...`);
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

async function tick() {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${APP_URL}/api/shopify/process-job`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(SECRET ? { "x-shopify-worker-secret": SECRET } : {}),
      },
      signal: ac.signal,
    });
  } finally {
    clearTimeout(timer);
  }
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
