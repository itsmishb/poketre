import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { claimNextJob, markFailed, markSucceeded } from "@/lib/shopify/jobs";
import { upsertProduct, updateInventoryOnly, unpublishProduct } from "@/lib/shopify/sync";
import { importOrdersSince } from "@/lib/shopify/orders-poll";
import { ShopifyError } from "@/lib/shopify/client";

/**
 * POST /api/shopify/process-job
 * 1リクエスト = 1ジョブ。Cloud Tasks / Cron からポーリング呼び出し。
 *
 * Auth: SHOPIFY_WORKER_SHARED_SECRET (X-Shopify-Worker-Secret ヘッダー) 必須。
 * env 未設定時は 503 で拒否する（無認証突破を防ぐ）。
 */
export async function POST(req: Request) {
  const secret = process.env.SHOPIFY_WORKER_SHARED_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "SHOPIFY_WORKER_SHARED_SECRET is not configured" },
      { status: 503 }
    );
  }
  const provided = req.headers.get("x-shopify-worker-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await claimNextJob();
  if (!job) return NextResponse.json({ ok: true, idle: true });

  try {
    switch (job.job_type) {
      case "UPSERT_PRODUCT":
        if (!job.card_id) throw new Error("card_id required for UPSERT_PRODUCT");
        await upsertProduct(job.card_id);
        break;
      case "UPDATE_INVENTORY":
        if (!job.card_id) throw new Error("card_id required for UPDATE_INVENTORY");
        await updateInventoryOnly(job.card_id);
        break;
      case "UNPUBLISH_PRODUCT":
        if (!job.card_id) throw new Error("card_id required for UNPUBLISH_PRODUCT");
        await unpublishProduct(job.card_id);
        break;
      case "IMPORT_ORDERS": {
        const sinceRaw = (job.payload as { since?: string } | null)?.since;
        await importOrdersSince(sinceRaw ? new Date(sinceRaw) : undefined);
        break;
      }
      default:
        throw new Error(`Unknown job_type: ${job.job_type}`);
    }
    await markSucceeded(job.job_id);
    return NextResponse.json({ ok: true, jobId: job.job_id, jobType: job.job_type });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const retryable = err instanceof ShopifyError ? err.retryable : true;
    const finalStatus = retryable
      ? await markFailed(job.job_id, job.attempt, msg)
      : (await markFailed(job.job_id, 999, msg)); // 非リトライエラーは即 FAILED 扱い
    return NextResponse.json(
      { ok: false, jobId: job.job_id, error: msg, status: finalStatus },
      { status: finalStatus === "RETRY" ? 500 : 200 }
    );
  }
}
