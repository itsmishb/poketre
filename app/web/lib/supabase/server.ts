import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isDemoMode } from "@/lib/demo";

export async function createClient() {
  if (isDemoMode) {
    return null;
  }
  try {
    const cookieStore = await cookies();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (!url || !key) return null;

    return createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              if (options != null) {
                cookieStore.set(name, value, options as { maxAge?: number; path?: string });
              } else {
                cookieStore.set(name, value);
              }
            });
          } catch {
            // Server Component 内では set を無視
          }
        },
      },
    });
  } catch {
    return null;
  }
}
