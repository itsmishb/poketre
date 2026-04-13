"use server";

import { revalidatePath } from "next/cache";
import { isDemoMode } from "@/lib/demo";
import { createClient } from "@/lib/supabase/server";

export type UpdateCardPublicDescriptionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * cards.public_description_ja を更新。RLS で弾かれる場合はエラーメッセージに含まれる。
 * サーバー専用キーが必要な運用の場合は Supabase ポリシーまたは service role 利用を検討。
 */
export async function updateCardPublicDescription(
  cardId: string,
  text: string
): Promise<UpdateCardPublicDescriptionResult> {
  if (isDemoMode) {
    return { ok: false, error: "デモモードでは保存できません。" };
  }

  const trimmed = text.trim();
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, error: "Supabase に接続できません。環境変数を確認してください。" };
  }

  const { error } = await supabase
    .from("cards")
    .update({ public_description_ja: trimmed || null })
    .eq("card_id", cardId);

  if (error) {
    const hint =
      error.code === "42501" || /permission|policy|rls/i.test(error.message)
        ? " RLS や権限を確認するか、マイグレーション 000003 で列 public_description_ja が存在するか確認してください。"
        : error.message.includes("column") || error.code === "42703"
          ? " マイグレーション 000003_card_public_description を DB に適用し、Supabase で cards テーブルが公開されているか確認してください。"
          : "";
    return { ok: false, error: `${error.message}${hint}` };
  }

  revalidatePath(`/cards/${cardId}`);
  return { ok: true };
}
