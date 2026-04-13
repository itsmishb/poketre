import "server-only";

/** Cloud SQL / ローカル Postgres 用（サーバー専用。クライアントでは常に false 扱いにしないこと） */
export function isDatabaseConfigured(): boolean {
  return (
    typeof process.env.DATABASE_URL === "string" &&
    process.env.DATABASE_URL.length > 0
  );
}
