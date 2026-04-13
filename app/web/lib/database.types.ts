/**
 * Supabase テーブル型（要約）。
 * 実際のスキーマは Supabase ダッシュボードで作成し、supabase gen types で生成することを推奨。
 */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface OcrStaging {
  id?: string;
  stg_id?: string;
  file_name?: string;
  image_url?: string;
  ai_json?: string;
  status?: string;
  serial_number?: string;
  qty?: number;
  set_code?: string;
  regulation_mark?: string;
  card_number?: number;
  number_total?: number;
  rarity?: string;
  card_type?: string;
  name_ja?: string;
  illustrator?: string;
  card_number_text?: string;
  generation?: string;
  poke_type?: string;
  trainer_subtype?: string;
  confidence?: number;
  review_status?: string;
  reviewer_id?: string;
  approved_at?: string;
  initial_qty?: number;
  initial_condition?: string;
  storage_location_id?: string;
  approved_inventory_type?: string;
  created_at?: string;
  updated_at?: string;
}
