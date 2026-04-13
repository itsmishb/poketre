import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { isDatabaseConfigured } from "@/lib/server-data";
import { rejectStagingRow } from "@/lib/db/staging";
import { requireOperatorOrAdminUser } from "@/lib/authz";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const review_status = body.review_status ?? "REJECTED";

  const authz = await requireOperatorOrAdminUser();
  if (!authz.ok) {
    return NextResponse.json({ message: authz.message }, { status: authz.status });
  }

  if (isDatabaseConfigured()) {
    try {
      await rejectStagingRow(id, review_status, authz.user.id);
      return NextResponse.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ message }, { status: 500 });
    }
  }

  if (isDemoMode) {
    return NextResponse.json({ ok: true });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ ok: true });
  }
  const { error } = await supabase
    .from("ocr_staging")
    .update({
      review_status,
      reviewer_id: authz.user.id,
    })
    .eq("stg_id", id);

  if (error) {
    return NextResponse.json(
      { message: error.message ?? "更新に失敗しました。" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
