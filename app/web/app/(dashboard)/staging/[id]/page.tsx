import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo";
import { getDemoStagingDetail, isDemoStagingId } from "@/lib/demo-data";
import { isDatabaseConfigured } from "@/lib/server-data";
import { getStagingByStgId } from "@/lib/db/staging";
import { StatusBadge } from "@/components/ui/status-badge";
import { StagingConfirmForm } from "./staging-confirm-form";

export const metadata = {
  title: "登録待ち確認 | Poketre",
};

export default async function StagingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const isDemo = isDemoMode;
  const supabase = await createClient();

  let row: {
    id?: string;
    file_name?: string | null;
    image_url?: string | null;
    serial_number?: string | null;
    name_ja?: string | null;
    set_code?: string | null;
    card_number_text?: string | null;
    rarity?: string | null;
    card_type?: string | null;
    qty?: number | null;
    input_location_code?: string | null;
    duplicate_status?: "NONE" | "CANDIDATE" | "RESOLVED";
    duplicate_card_id?: string | null;
    merge_decision?: "MERGE_EXISTING" | "CREATE_NEW" | null;
    ocr_status?: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
    status?: string;
  } | null = null;

  if (isDemo && isDatabaseConfigured()) {
    try {
      const pgRow = await getStagingByStgId(id);
      if (pgRow) {
        row = {
          id: pgRow.id,
          file_name: pgRow.file_name,
          image_url: pgRow.image_url,
          serial_number: pgRow.serial_number,
          name_ja: pgRow.name_ja,
          set_code: pgRow.set_code,
          card_number_text: pgRow.card_number_text,
          rarity: pgRow.rarity,
          card_type: pgRow.card_type,
          qty: pgRow.qty,
          input_location_code: pgRow.input_location_code,
          duplicate_status: pgRow.duplicate_status,
          duplicate_card_id: pgRow.duplicate_card_id,
          merge_decision: pgRow.merge_decision,
          ocr_status: pgRow.ocr_status,
          status: pgRow.status,
        };
      }
    } catch {
      // Postgres 未到達時はデモデータへフォールバック
    }
  }
  if (!row && isDemo && isDemoStagingId(id)) {
    const demoRow = getDemoStagingDetail(id);
    if (demoRow) row = { ...demoRow };
  }
  if (!row && supabase) {
    const { data, error } = await supabase
      .from("ocr_staging")
      .select("*")
      .eq("stg_id", id)
      .single();
    if (!error && data) row = data;
  }

  if (!row) {
    notFound();
  }

  const ocrStatusValue =
    row.status === "OCR失敗" || row.ocr_status === "FAILED" ? "失敗" :
    row.status === "OCR中"   || row.ocr_status === "RUNNING" ? "実行中" :
    row.ocr_status === "PENDING" ? "待機中" :
    "完了";

  return (
    <div className="space-y-6">
      {/* ── ヘッダー ── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">登録待ち確認</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          内容を確認し、OK で正式登録または NG・要再スキャンを選択してください。
        </p>
      </div>

      {/* ── メタ情報バー ── */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm">
        {row.serial_number && (
          <span className="font-mono text-xs font-medium text-foreground">{row.serial_number}</span>
        )}
        {row.set_code && (
          <span className="text-muted-foreground">{row.set_code}</span>
        )}
        {row.rarity && (
          <span className="text-muted-foreground">{row.rarity}</span>
        )}
        <StatusBadge kind="ocrStatus" value={ocrStatusValue} />
        {row.duplicate_status && row.duplicate_status !== "NONE" && (
          <StatusBadge
            kind="duplicateStatus"
            value={row.duplicate_status === "CANDIDATE" ? "候補あり" : "解決済"}
          />
        )}
      </div>

      {/* ── 2カラムレイアウト ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左：カード画像 */}
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">カード画像</h2>
            {row.file_name && (
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {row.file_name}
              </p>
            )}
          </div>
          <div className="flex items-center justify-center p-6">
            {row.image_url ? (
              <Image
                src={row.image_url}
                alt={row.name_ja ?? "カード画像"}
                width={320}
                height={448}
                className="max-h-[28rem] w-auto rounded-lg object-contain shadow-md"
              />
            ) : (
              <div className="flex h-64 w-full items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                画像なし
              </div>
            )}
          </div>
        </div>

        {/* 右：確認フォーム */}
        <StagingConfirmForm
          stagingId={id}
          initial={{
            serial_number: row.serial_number ?? "",
            name_ja: row.name_ja ?? "",
            set_code: row.set_code ?? "",
            card_number_text: row.card_number_text ?? "",
            rarity: row.rarity ?? "",
            card_type: row.card_type ?? "",
            qty: row.qty ?? 1,
            input_location_code: row.input_location_code ?? "",
            duplicate_status: row.duplicate_status ?? "NONE",
            duplicate_card_id: row.duplicate_card_id ?? null,
            merge_decision: row.merge_decision ?? null,
            ocr_status: row.ocr_status ?? "SUCCEEDED",
            status: row.status ?? "登録待ち",
          }}
        />
      </div>
    </div>
  );
}
