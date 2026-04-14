"use client";

import { useState } from "react";
import Link from "next/link";
import { parseLocationCode } from "@/lib/storage-layout";
import { Button } from "@/components/ui/button";

export default function StagingImportPage() {
  const [locationCode, setLocationCode] = useState("1-1-1");
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [batchAccepted, setBatchAccepted] = useState(false);

  async function handleSubmit() {
    setMessage(null);
    setBatchAccepted(false);
    if (!parseLocationCode(locationCode)) {
      setMessage({
        type: "error",
        text: "保管場所コードは tier-box-col 形式（例: 1-2-3）で入力してください。",
      });
      return;
    }
    if (files.length === 0) {
      setMessage({ type: "error", text: "画像を 1 件以上選択してください。" });
      return;
    }

    const fd = new FormData();
    fd.set("input_location_code", locationCode);
    for (const f of files) fd.append("files", f);

    setPending(true);
    const res = await fetch("/api/staging/import", { method: "POST", body: fd });
    setPending(false);

    const body = (await res.json().catch(() => ({}))) as {
      message?: string;
      batch_id?: string;
      count?: number;
      estimated_minutes?: number;
    };

    if (!res.ok) {
      setMessage({ type: "error", text: body.message ?? "取り込みに失敗しました。" });
      return;
    }

    // sessionStorage にバッチIDを保存（一覧ページのポーリングに使用）
    if (body.batch_id) {
      try {
        const saved = JSON.parse(sessionStorage.getItem("pendingBatches") ?? "[]") as string[];
        saved.push(body.batch_id);
        sessionStorage.setItem("pendingBatches", JSON.stringify(saved));
      } catch {
        // sessionStorage 利用不可（プライベートブラウジング等）は無視
      }
    }

    setMessage({
      type: "success",
      text: `取り込みを受け付けました（${body.count ?? 0}件）。完了まで約 ${body.estimated_minutes ?? 1} 分です。`,
    });
    setBatchAccepted(true);
    setFiles([]);
  }

  const inputClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

  return (
    <div className="space-y-6">
      {/* ── ヘッダー ── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">OCR 一括取り込み</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          スキャン画像をアップロードすると、Gemini Vision が自動でカード情報を非同期で抽出します。
        </p>
      </div>

      {/* ── フォーム ── */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">取り込み設定</h2>
        </div>
        <div className="p-5 space-y-5 md:max-w-lg">
          {/* 保管場所コード */}
          <div>
            <label htmlFor="location_code" className={labelClass}>
              保管場所コード <span className="text-destructive">*</span>
            </label>
            <input
              id="location_code"
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value)}
              className={inputClass}
              placeholder="例: 1-2-3"
            />
            <p className="mt-1 text-xs text-muted-foreground">棚番号-箱番号-列番号 の形式で入力してください。</p>
          </div>

          {/* 画像ファイル */}
          <div>
            <label htmlFor="files" className={labelClass}>
              画像ファイル <span className="text-destructive">*</span>
            </label>
            <input
              id="files"
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:bg-accent"
            />
            <p className="mt-1 text-xs text-muted-foreground">最大 500 件、1 ファイル 5MB まで。</p>
          </div>

          {/* 選択中ファイル数 */}
          {files.length > 0 && (
            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-foreground">
              選択中: <strong>{files.length}</strong> 件
            </div>
          )}

          {/* 通知 */}
          {message && (
            <p
              className={`rounded-lg px-3 py-2 text-sm ${
                message.type === "error"
                  ? "bg-destructive/10 text-destructive"
                  : "bg-emerald-50 text-emerald-700"
              }`}
              role={message.type === "error" ? "alert" : "status"}
            >
              {message.text}
            </p>
          )}

          {/* 成功後のナビゲーション */}
          {batchAccepted && (
            <div className="flex items-center gap-3 text-sm">
              <Link
                href="/staging"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                登録待ち一覧で進捗を確認 →
              </Link>
              <span className="text-muted-foreground">または続けてアップロードできます</span>
            </div>
          )}

          {/* ボタン */}
          <div className="flex gap-2">
            <Button type="button" onClick={handleSubmit} isLoading={pending}>
              一括取り込みを開始
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
