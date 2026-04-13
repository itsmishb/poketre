import { createBrowserClient } from "@supabase/ssr";
import { isDemoMode } from "@/lib/demo";

export function createClient() {
  if (isDemoMode) {
    return null;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  try {
    return createBrowserClient(url, key);
  } catch {
    return null;
  }
}
