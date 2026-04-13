/**
 * TCGdex API ルックアップ
 * https://api.tcgdex.net/v2/ja/cards/{setCode}/{localId}
 *
 * setCode: "sv4a", "sv8" など（小文字）
 * localId: "1", "165" など（ゼロ埋めなし）
 */
import type { OcrCardResult } from "./schema";

const BASE = process.env.TCGDEX_API_BASE ?? "https://api.tcgdex.net/v2/ja";

type TcgdexCard = {
  id: string;
  localId: string;
  name: string;
  hp?: number;
  rarity?: string;
  category?: string;       // "Pokemon" / "Trainer" / "Energy"
  regulationMark?: string;
  suffix?: string;         // "EX", "GX" など
};

const RARITY_MAP: Record<string, string> = {
  "Common":                    "C",
  "Uncommon":                  "U",
  "Rare":                      "R",
  "Double Rare":               "RR",
  "Art Rare":                  "AR",
  "Super Rare":                "SR",
  "Special Art Rare":          "SAR",
  "Ultra Rare":                "UR",
  "Illustration Rare":         "IR",
  "Special Illustration Rare": "SIR",
  "Hyper Rare":                "HR",
  "ACE SPEC Rare":             "ACE",
  "Shiny Rare":                "S",
  "Shiny Ultra Rare":          "SS",
};

const CATEGORY_MAP: Record<string, string> = {
  "Pokemon":  "ポケモン",
  "Trainer":  "トレーナーズ",
  "Energy":   "エネルギー",
};

function toLocalId(cardNumberText: string): string {
  // "001/165" → "1"（ゼロ埋めなし、分子のみ）
  const parts = cardNumberText.split("/");
  return String(parseInt(parts[0], 10));
}

export async function lookupByCardNumber(
  setCode: string,
  cardNumberText: string
): Promise<Partial<OcrCardResult> | null> {
  const localId = toLocalId(cardNumberText);
  const url = `${BASE}/cards/${setCode.toLowerCase()}/${localId}`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 86400 },  // 24h キャッシュ
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const card = (await res.json()) as TcgdexCard;

    return {
      name_ja:         card.name ?? null,
      rarity:          RARITY_MAP[card.rarity ?? ""] ?? card.rarity ?? null,
      card_type:       CATEGORY_MAP[card.category ?? ""] ?? null,
      hp:              card.hp ?? null,
      regulation_mark: card.regulationMark ?? null,
      tcgdex_id:       card.id ?? null,
    };
  } catch {
    return null;
  }
}
