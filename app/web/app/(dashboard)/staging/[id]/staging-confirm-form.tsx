"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { inventoryHref, newListingHref } from "@/lib/card-routes";
import { Button } from "@/components/ui/button";

type Props = {
  stagingId: string;
  initial: {
    serial_number: string;
    name_ja: string;
    set_code: string;
    card_number_text: string;
    rarity: string;
    card_type: string;
    qty: number;
    input_location_code: string;
    duplicate_status: "NONE" | "CANDIDATE" | "RESOLVED";
    duplicate_card_id: string | null;
    merge_decision: "MERGE_EXISTING" | "CREATE_NEW" | null;
    ocr_status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
    status: string;
  };
};

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

export function StagingConfirmForm({ stagingId, initial }: Props) {
  const router = useRouter();
  const [initialQty, setInitialQty] = useState(String(initial.qty));
  const [condition, setCondition] = useState("A");
  const [inventoryType, setInventoryType] = useState<"UNIT" | "LOT">("UNIT");
  const [locationCode, setLocationCode] = useState(initial.input_location_code || "");
  const [mergeDecision, setMergeDecision] = useState<"MERGE_EXISTING" | "CREATE_NEW">(
    initial.merge_decision ?? (initial.duplicate_card_id ? "MERGE_EXISTING" : "CREATE_NEW")
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [approved, setApproved] = useState(false);
  const [loading, setLoading] = useState(false);
  const ocrNotReady =
    initial.status === "OCR中" ||
    initial.ocr_status === "PENDING" ||
    initial.ocr_status === "RUNNING";

  async function handleApprove() {
    const qty = parseInt(initialQty, 10);
    setNotice(null);
    if (isNaN(qty) || qty < 1) {
      setError("初期数量は 1 以上を入力してください。");
      return;
    }
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/staging/${stagingId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        initial_qty: qty,
        condition_grade: condition,
        approved_inventory_type: inventoryType,
        merge_decision: mergeDecision,
        duplicate_card_id:
          mergeDecision === "MERGE_EXISTING" ? initial.duplicate_card_id : null,
        input_location_code: locationCode || null,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setNotice({
        type: "error",
        text: body.message ?? "登録に失敗しました。しばらくしてからやり直してください。",
      });
      return;
    }
    setApproved(true);
    setNotice({ type: "success", text: "正式登録しました。次の作業へ進んでください。" });
  }

  async function handleReject(status: "REJECTED" | "NEEDS_RESCAN") {
    setNotice(null);
    setLoading(true);
    const res = await fetch(`/api/staging/${stagingId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_status: status }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setNotice({
        type: "error",
        text: body.message ?? "更新に失敗しました。しばらくしてからやり直してください。",
      });
      return;
    }
    setNotice({
      type: "success",
      text:
        status === "REJECTED"
          ? "NG として記録しました。登録待ち一覧へ戻ります。"
          : "要再スキャンとして記録しました。登録待ち一覧へ戻ります。",
    });
    router.refresh();
    router.push("/staging");
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {/* セクション：抽出内容 */}
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">抽出内容</h2>
      </div>

      <div className="p-4 space-y-5">
        {ocrNotReady && (
          <p className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-primary">
            OCR 実行中です。完了後に確定操作を行ってください。
          </p>
        )}

        {/* 読み取り結果 */}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">カード識別子</dt>
          <dd className="font-mono font-medium text-foreground">{initial.serial_number || "—"}</dd>
          <dt className="text-muted-foreground">カード名</dt>
          <dd className="text-foreground">{initial.name_ja || "—"}</dd>
          <dt className="text-muted-foreground">セット</dt>
          <dd className="text-foreground">{initial.set_code || "—"}</dd>
          <dt className="text-muted-foreground">番号</dt>
          <dd className="text-foreground">{initial.card_number_text || "—"}</dd>
          <dt className="text-muted-foreground">レアリティ</dt>
          <dd className="text-foreground">{initial.rarity || "—"}</dd>
          <dt className="text-muted-foreground">カード種類</dt>
          <dd className="text-foreground">{initial.card_type || "—"}</dd>
        </dl>

        <div className="border-t pt-4 space-y-4">
          {/* 初期数量 */}
          <div>
            <label htmlFor="initial_qty" className={labelClass}>初期数量</label>
            <input
              type="number"
              id="initial_qty"
              min={1}
              value={initialQty}
              onChange={(e) => setInitialQty(e.target.value)}
              className={`${inputClass} w-24`}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "initial_qty_error" : undefined}
            />
            {error && (
              <p id="initial_qty_error" className="mt-1 text-xs text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>

          {/* 状態グレード */}
          <div>
            <label htmlFor="condition_grade" className={labelClass}>状態グレード</label>
            <select
              id="condition_grade"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className={inputClass}
            >
              <option value="S">S — 美品</option>
              <option value="A">A — 良品</option>
              <option value="B">B — 並品</option>
              <option value="C">C — 難あり</option>
            </select>
          </div>

          {/* 管理単位 */}
          <div>
            <label htmlFor="inventory_type" className={labelClass}>管理単位</label>
            <select
              id="inventory_type"
              value={inventoryType}
              onChange={(e) => setInventoryType(e.target.value as "UNIT" | "LOT")}
              className={inputClass}
            >
              <option value="UNIT">1枚単位</option>
              <option value="LOT">ロット</option>
            </select>
          </div>

          {/* 保管場所 */}
          <div>
            <label htmlFor="location_code" className={labelClass}>保管場所コード</label>
            <input
              id="location_code"
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value)}
              className={inputClass}
              placeholder="例: 1-2-3"
            />
          </div>

          {/* 重複候補 */}
          {initial.duplicate_status === "CANDIDATE" && (
            <div>
              <label htmlFor="merge_decision" className={labelClass}>重複候補の扱い</label>
              <select
                id="merge_decision"
                value={mergeDecision}
                onChange={(e) => setMergeDecision(e.target.value as "MERGE_EXISTING" | "CREATE_NEW")}
                className={inputClass}
              >
                <option value="MERGE_EXISTING">既存カードへ統合する</option>
                <option value="CREATE_NEW">新規カードとして登録する</option>
              </select>
              {initial.duplicate_card_id && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  候補カードID:{" "}
                  <span className="font-mono text-amber-700">{initial.duplicate_card_id}</span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* 通知 */}
        {notice && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              notice.type === "error"
                ? "bg-destructive/10 text-destructive"
                : "bg-emerald-50 text-emerald-700"
            }`}
            role={notice.type === "error" ? "alert" : "status"}
          >
            {notice.text}
          </p>
        )}

        {/* アクションボタン */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            onClick={handleApprove}
            isLoading={loading}
            disabled={approved || ocrNotReady}
          >
            {approved ? "正式登録済み" : "OK（正式登録）"}
          </Button>
          <Button
            type="button"
            onClick={() => handleReject("REJECTED")}
            variant="secondary"
            isLoading={loading}
          >
            NG
          </Button>
          <Button
            type="button"
            onClick={() => handleReject("NEEDS_RESCAN")}
            variant="secondary"
            isLoading={loading}
          >
            要再スキャン
          </Button>
        </div>

        {/* 登録後のナビゲーション */}
        {approved && initial.serial_number && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
            <p className="font-medium">次の作業へ進む:</p>
            <div className="mt-2 flex flex-wrap gap-3">
              <Link
                href={inventoryHref({ serial: initial.serial_number })}
                className="font-medium text-primary hover:underline"
              >
                在庫を確認
              </Link>
              <Link
                href={newListingHref(initial.serial_number)}
                className="font-medium text-primary hover:underline"
              >
                出品作成へ
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
