import { NextResponse } from "next/server";

type CheckStatus = "ok" | "not_configured" | "error";
type Check = { status: CheckStatus; detail?: string };

async function checkDb(): Promise<Check> {
  if (!process.env.DATABASE_URL) return { status: "not_configured" };
  try {
    const { getPool } = await import("@/lib/db/pool");
    await getPool().query("SELECT 1");
    return { status: "ok" };
  } catch (e) {
    return { status: "error", detail: e instanceof Error ? e.message : String(e) };
  }
}

function checkShopify(): Check {
  const configured = Boolean(process.env.SHOPIFY_ENCRYPTION_KEY);
  if (!configured) return { status: "not_configured" };
  const hasWorkerSecret = Boolean(process.env.SHOPIFY_WORKER_SHARED_SECRET);
  if (!hasWorkerSecret) {
    return { status: "error", detail: "SHOPIFY_WORKER_SHARED_SECRET missing (worker endpoints unreachable)" };
  }
  return { status: "ok" };
}

function checkGcs(): Check {
  const bucket = process.env.GCS_BUCKET;
  if (!bucket) return { status: "not_configured" };
  return { status: "ok", detail: `bucket=${bucket}` };
}

function checkOcr(): Check {
  const hasSecret = Boolean(process.env.OCR_WORKER_SHARED_SECRET);
  const hasProject = Boolean(process.env.GOOGLE_CLOUD_PROJECT);
  if (!hasSecret && !hasProject) return { status: "not_configured" };
  if (!hasSecret) return { status: "error", detail: "OCR_WORKER_SHARED_SECRET missing" };
  return { status: "ok" };
}

export async function GET() {
  const [db, shopify, gcs, ocr] = await Promise.all([
    checkDb(),
    Promise.resolve(checkShopify()),
    Promise.resolve(checkGcs()),
    Promise.resolve(checkOcr()),
  ]);

  const checks = { db, shopify, gcs, ocr };
  const hasError = Object.values(checks).some((c) => c.status === "error");

  return NextResponse.json(
    { ok: !hasError, checks },
    { status: hasError ? 503 : 200 }
  );
}
