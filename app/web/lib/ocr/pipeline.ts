/**
 * OCR パイプライン v2
 * Stage 1: Gemini 2.5 Flash で画像解析
 * Stage 2: TCGdex で公式データを補完（confidence ≥ 0.7 かつ識別フィールドあり時）
 */
import "server-only";
import { extractCardFromImage } from "./gemini";
import { lookupByCardNumber } from "./tcgdex";
import type { OcrCardResult } from "./schema";

const CONFIDENCE_THRESHOLD = 0.7;

/**
 * メイン OCR パイプライン
 *   1. Gemini 2.5 Flash で画像を解析
 *   2. confidence ≥ 0.7 かつ識別フィールドあり → TCGdex で補完
 */
export async function runOcrPipeline(
  imageBytes: Buffer,
  mimeType: string
): Promise<OcrCardResult> {
  // Stage 1: Gemini OCR
  const geminiResult = await extractCardFromImage(imageBytes, mimeType);

  // Stage 2: TCGdex 補完（条件付き）
  const canLookup =
    geminiResult.confidence >= CONFIDENCE_THRESHOLD &&
    geminiResult.set_code &&
    geminiResult.card_number_text;

  if (!canLookup) {
    return geminiResult;
  }

  const tcgdexData = await lookupByCardNumber(
    geminiResult.set_code!,
    geminiResult.card_number_text!
  );

  if (!tcgdexData) {
    // TCGdex ミス → Gemini データのみ
    return geminiResult;
  }

  // TCGdex データで Gemini 結果を上書き（公式データを優先）
  return {
    ...geminiResult,
    name_ja:         tcgdexData.name_ja         ?? geminiResult.name_ja,
    rarity:          tcgdexData.rarity          ?? geminiResult.rarity,
    card_type:       tcgdexData.card_type       ?? geminiResult.card_type,
    hp:              tcgdexData.hp              ?? geminiResult.hp,
    regulation_mark: tcgdexData.regulation_mark ?? geminiResult.regulation_mark,
    tcgdex_id:       tcgdexData.tcgdex_id       ?? null,
    data_source:     "gemini+tcgdex",
  };
}
