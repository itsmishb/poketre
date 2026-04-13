import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { isDatabaseConfigured } from "@/lib/server-data";
import { approveStagingRow } from "@/lib/db/staging";
import { parseLocationCode } from "@/lib/storage-layout";
import { requireOperatorOrAdminUser } from "@/lib/authz";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const initial_qty = Number(body.initial_qty) || 1;
  const condition_grade = body.condition_grade ?? "A";
  const approved_inventory_type = body.approved_inventory_type ?? "UNIT";
  const merge_decision =
    body.merge_decision === "MERGE_EXISTING" || body.merge_decision === "CREATE_NEW"
      ? body.merge_decision
      : null;
  const duplicate_card_id =
    typeof body.duplicate_card_id === "string" && body.duplicate_card_id.length > 0
      ? body.duplicate_card_id
      : null;
  const input_location_code =
    typeof body.input_location_code === "string" && body.input_location_code.length > 0
      ? body.input_location_code
      : null;
  if (input_location_code && !parseLocationCode(input_location_code)) {
    return NextResponse.json(
      { message: "保管場所コードは tier-box-col 形式（例: 1-2-3）で入力してください。" },
      { status: 400 }
    );
  }

  const authz = await requireOperatorOrAdminUser();
  if (!authz.ok) {
    return NextResponse.json({ message: authz.message }, { status: authz.status });
  }

  if (isDatabaseConfigured()) {
    try {
      await approveStagingRow(id, {
        initial_qty,
        condition_grade,
        approved_inventory_type,
        reviewer_id: authz.user.id,
        merge_decision,
        duplicate_card_id,
        input_location_code,
      });
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
      review_status: "APPROVED",
      status: "確定",
      approved_at: new Date().toISOString(),
      initial_qty,
      initial_condition: condition_grade,
      approved_inventory_type,
      reviewer_id: authz.user.id,
      merge_decision,
      duplicate_card_id,
      input_location_code,
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
