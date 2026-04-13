"use client";

import { useState, useTransition } from "react";
import { updateCardPublicDescription } from "@/app/actions/card-public-description";

type Props = {
  cardId: string;
  initialDescription: string | null;
  isDemo: boolean;
  draftContext: {
    name_ja: string;
    set_code: string;
    rarity: string;
    card_number_text: string;
  };
};

export function CardPublicDescriptionSection({
  cardId,
  initialDescription,
  isDemo,
  draftContext,
}: Props) {
  const [value, setValue] = useState(initialDescription ?? "");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [aiPending, setAiPending] = useState(false);
  const [savePending, startSaveTransition] = useTransition();

  async function handleDraftWithGemini() {
    setMessage(null);
    setAiPending(true);
    try {
      const res = await fetch("/api/ai/draft-listing-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name_ja: draftContext.name_ja,
          set_code: draftContext.set_code,
          rarity: draftContext.rarity,
          card_number_text: draftContext.card_number_text,
        }),
      });
      const data = (await res.json()) as { text?: string; error?: string; detail?: string };
      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.detail || data.error || "下書きに失敗しました。",
        });
        return;
      }
      if (data.text) {
        setValue(data.text);
        setMessage({
          type: "success",
          text: "下書きを反映しました。内容を確認してから保存してください。",
        });
      }
    } catch {
      setMessage({ type: "error", text: "通信に失敗しました。" });
    } finally {
      setAiPending(false);
    }
  }

  function handleSave() {
    setMessage(null);
    if (isDemo) {
      setMessage({ type: "error", text: "デモモードでは保存できません。" });
      return;
    }
    startSaveTransition(async () => {
      const result = await updateCardPublicDescription(cardId, value);
      if (result.ok) {
        setMessage({ type: "success", text: "保存しました。" });
      } else {
        setMessage({ type: "error", text: result.error });
      }
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 sm:col-span-2">
      <h2 className="text-sm font-medium text-slate-500">出品向け紹介文（マスタ）</h2>
      <p className="mt-1 text-xs text-slate-500">
        DB の <code className="rounded bg-slate-100 px-1">cards.public_description_ja</code>
        。チャネル別の文言は出品（listings）側で上書きできます。
      </p>
      <label htmlFor="card_public_description" className="mt-3 block text-sm font-medium text-slate-700">
        紹介文
      </label>
      <textarea
        id="card_public_description"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm"
        placeholder="紹介文を入力するか、Gemini で下書きを生成してください。"
        disabled={savePending}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleDraftWithGemini}
          disabled={aiPending || savePending}
          className="rounded bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {aiPending ? "生成中…" : "Gemini で下書き"}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={savePending || aiPending}
          className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {savePending ? "保存中…" : "保存"}
        </button>
      </div>
      {message && (
        <p
          className={`mt-2 text-sm ${message.type === "error" ? "text-red-600" : "text-slate-700"}`}
          role={message.type === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
