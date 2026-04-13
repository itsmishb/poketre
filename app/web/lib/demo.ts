/**
 * Supabase の URL が未設定のときはデモモードとする。
 * デモモードではログイン不要でダッシュボード以降を表示し、DB 取得はスキップする。
 * NEXT_PUBLIC_ なのでクライアント・サーバー両方で参照可能。
 * 空白のみの値は「未設定」と同扱い（誤って本番扱いになり middleware で落ちるのを防ぐ）。
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

export const isDemoMode = supabaseUrl === "" || supabaseAnon === "";
