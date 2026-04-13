/**
 * OCR 抽出結果スキーマ v2
 * Gemini 2.5 Flash + TCGdex 補完後の最終型
 */

export type OcrCardResult = {
  // 識別フィールド（優先度: 高）
  serial_number:    string | null;  // "SV4a_001/165"
  set_code:         string | null;  // "SV4a"
  card_number_text: string | null;  // "001/165"
  regulation_mark:  string | null;  // "G", "H", "I" など

  // カード情報
  name_ja:          string | null;  // "ピカチュウ"
  rarity:           string | null;  // "C", "R", "SR", "SAR" など
  card_type:        string | null;  // "ポケモン" / "トレーナーズ" / "エネルギー"
  hp:               number | null;  // 230（ポケモンのみ）

  // メタ情報
  confidence:       number;         // 0〜1
  data_source:      "gemini" | "tcgdex" | "gemini+tcgdex";
  tcgdex_id:        string | null;  // TCGdex カード ID（例: "sv4a-1"）
};

export type GeminiOcrResponse = OcrCardResult;
