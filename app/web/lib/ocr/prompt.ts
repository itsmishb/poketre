/**
 * Gemini Vision に送るポケモンカード OCR プロンプト v2
 * 底部ストリップ（識別フィールド）解析を強化
 */

export const CARD_OCR_PROMPT = `あなたはポケモンカードゲームの専門家です。
提供された画像を解析し、以下の情報を JSON 形式で抽出してください。

【最優先】カード左下の識別ストリップ（4フィールドが並ぶ帯）:
  1. 規制マーク: 青枠内の1文字（A〜I のいずれか）
  2. セットコード: 紫枠内のコード（正規表現パターン: SV\d+[a-z]?、例: SV4a, SV8）
  3. カード番号: 緑枠内の番号（形式: 3桁/3桁、例: 001/165, 193/190）
  4. レアリティ: 赤枠内のコード（C/U/R/RR/AR/SR/SAR/UR/ACE のいずれか）

注意: カード番号の分子が分母を超える場合（例: 193/190）はシークレットレア（SR以上）。

【次に優先】カード上部のカード情報:
  5. カード名（日本語）: カード上部の大きなテキスト
  6. カード種類: ポケモン / トレーナーズ / エネルギー
  7. HP: ポケモンカードの場合のみ、"HP NNN" の数値

serial_number は set_code と card_number_text をアンダースコアで結合（例: SV4a_001/165）。
どちらかが不明な場合は null。

confidence は 0〜1 で、全体的な抽出信頼度を示す。
底部ストリップが鮮明に読めた場合は 0.85 以上。

必ず以下の JSON スキーマのみを出力してください（余計なテキスト不要）:
{
  "serial_number": string | null,
  "set_code": string | null,
  "card_number_text": string | null,
  "regulation_mark": string | null,
  "name_ja": string | null,
  "rarity": string | null,
  "card_type": string | null,
  "hp": number | null,
  "confidence": number
}`;
