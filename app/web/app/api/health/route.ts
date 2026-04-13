import { NextResponse } from "next/server";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      ok: true,
      db: "not_configured",
      hint: "Set DATABASE_URL for Postgres health check",
    });
  }
  try {
    const { getPool } = await import("@/lib/db/pool");
    const pool = getPool();
    await pool.query("SELECT 1 AS ok");
    return NextResponse.json({ ok: true, db: "connected" });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, db: "error", message },
      { status: 503 }
    );
  }
}
