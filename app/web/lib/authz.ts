import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isDatabaseConfigured } from "@/lib/server-data";
import { getPool } from "@/lib/db/pool";

export type AuthorizedUser = {
  id: string;
  email: string | null;
};

export async function requireOperatorOrAdminUser(): Promise<
  { ok: true; user: AuthorizedUser } | { ok: false; status: number; message: string }
> {
  const supabase = await createClient();
  if (!supabase) {
    return { ok: false, status: 401, message: "認証クライアントを初期化できません。" };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, message: "認証が必要です。" };
  }

  if (!isDatabaseConfigured()) {
    return { ok: true, user: { id: user.id, email: user.email ?? null } };
  }
  const pool = getPool();
  const r = await pool.query<{ role: string }>(
    "SELECT role FROM app_users WHERE email = $1 LIMIT 1",
    [user.email ?? ""]
  );
  const role = r.rows[0]?.role;
  if (role !== "operator" && role !== "admin") {
    return { ok: false, status: 403, message: "操作権限がありません。" };
  }
  return { ok: true, user: { id: user.id, email: user.email ?? null } };
}
