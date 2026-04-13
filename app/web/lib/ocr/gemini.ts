/**
 * Gemini Vision を使ったポケモンカード OCR v2
 *
 * 使用モデル: gemini-2.5-flash-preview-04-17（高精度、底部ストリップ解析強化）
 * VertexAI SDK (@google-cloud/vertexai) を使用。
 */
import "server-only";
import { VertexAI } from "@google-cloud/vertexai";
import { CARD_OCR_PROMPT } from "./prompt";
import type { OcrCardResult } from "./schema";

const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-preview-04-17";
const LOCATION = process.env.VERTEX_AI_LOCATION ?? "asia-northeast1";

let vertexClient: VertexAI | null = null;

function getVertexClient(): VertexAI {
  if (!vertexClient) {
    const project = process.env.GOOGLE_CLOUD_PROJECT;
    if (!project) throw new Error("GOOGLE_CLOUD_PROJECT is required");
    vertexClient = new VertexAI({ project, location: LOCATION });
  }
  return vertexClient;
}

/**
 * 画像バッファを受け取り、Gemini でカード情報を抽出して返す。
 *
 * @param imageBytes - 画像のバイナリデータ
 * @param mimeType   - 画像の MIME タイプ（image/jpeg など）
 * @returns 抽出結果。モデルが JSON を返せなかった場合は全フィールド null。
 */
export async function extractCardFromImage(
  imageBytes: Buffer,
  mimeType: string
): Promise<OcrCardResult> {
  const vertex = getVertexClient();
  const model = vertex.preview.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      maxOutputTokens: 512,
      temperature: 0,
      responseMimeType: "application/json",
    },
  });

  const base64Image = imageBytes.toString("base64");

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64Image } },
          { text: CARD_OCR_PROMPT },
        ],
      },
    ],
  });

  const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  try {
    const parsed = JSON.parse(text) as Partial<OcrCardResult>;

    // serial_number を組み立て（モデルが省略した場合）
    let serial = parsed.serial_number ?? null;
    if (!serial && parsed.set_code && parsed.card_number_text) {
      serial = `${parsed.set_code}_${parsed.card_number_text}`;
    }

    return {
      serial_number:    serial,
      set_code:         parsed.set_code         ?? null,
      card_number_text: parsed.card_number_text  ?? null,
      regulation_mark:  parsed.regulation_mark   ?? null,
      name_ja:          parsed.name_ja           ?? null,
      rarity:           parsed.rarity            ?? null,
      card_type:        parsed.card_type         ?? null,
      hp:               typeof parsed.hp === "number" ? parsed.hp : null,
      confidence:       typeof parsed.confidence === "number" ? parsed.confidence : 0,
      data_source:      "gemini",
      tcgdex_id:        null,
    };
  } catch {
    // JSON パース失敗 — 全フィールド null で返す
    return {
      serial_number: null, set_code: null, card_number_text: null,
      regulation_mark: null, name_ja: null, rarity: null,
      card_type: null, hp: null, confidence: 0,
      data_source: "gemini", tcgdex_id: null,
    };
  }
}
