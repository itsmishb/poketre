/** JSON body for POST /api/ai/draft-listing-description */
export type ListingDescriptionDraftBody = {
  name_ja?: string;
  set_code?: string;
  rarity?: string;
  condition_grade?: string;
  card_number_text?: string;
};

export const LISTING_DESCRIPTION_SYSTEM_INSTRUCTION =
  "あなたは日本のポケモンカード通販の出品文を書く担当です。事実に反する効果や保証は書かず、中古品である前提で丁寧な紹介文を書いてください。箇条書きは使わず、2〜4短段落・合計250文字以内で。";

export function buildListingDescriptionUserText(body: ListingDescriptionDraftBody): string {
  const name = typeof body.name_ja === "string" ? body.name_ja.trim() : "";
  const lines = [
    `カード名: ${name}`,
    body.set_code ? `セット: ${body.set_code}` : null,
    body.card_number_text ? `番号表記: ${body.card_number_text}` : null,
    body.rarity ? `レアリティ: ${body.rarity}` : null,
    body.condition_grade ? `コンディション: ${body.condition_grade}` : null,
  ].filter(Boolean) as string[];
  return `次の情報だけを根拠に、EC出品用の紹介文を日本語で書いてください。\n\n${lines.join("\n")}`;
}

export function parseListingDescriptionBody(json: unknown): ListingDescriptionDraftBody | null {
  if (json === null || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  return {
    name_ja: typeof o.name_ja === "string" ? o.name_ja : undefined,
    set_code: typeof o.set_code === "string" ? o.set_code : undefined,
    rarity: typeof o.rarity === "string" ? o.rarity : undefined,
    condition_grade: typeof o.condition_grade === "string" ? o.condition_grade : undefined,
    card_number_text: typeof o.card_number_text === "string" ? o.card_number_text : undefined,
  };
}
