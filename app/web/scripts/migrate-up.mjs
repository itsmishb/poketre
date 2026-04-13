#!/usr/bin/env node
/**
 * golang-migrate 無しで dev 用に .up.sql を順に適用する。
 * schema_migrations にバージョンを記録する。
 *
 * 使い方: DATABASE_URL=... node scripts/migrate-up.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const migrationsDir = path.join(repoRoot, "db/migrations");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL を設定してください。");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version bigint PRIMARY KEY,
    dirty boolean NOT NULL DEFAULT false
  );
`);

const { rows: applied } = await client.query(
  "SELECT version FROM schema_migrations WHERE dirty = false ORDER BY version"
);
const done = new Set(applied.map((r) => Number(r.version)));

const files = (await readdir(migrationsDir))
  .filter((f) => f.endsWith(".up.sql"))
  .sort();

for (const file of files) {
  const m = file.match(/^(\d+)_/);
  if (!m) continue;
  const version = parseInt(m[1], 10);
  if (done.has(version)) {
    console.log(`skip ${file} (already applied)`);
    continue;
  }
  const sql = await readFile(path.join(migrationsDir, file), "utf8");
  console.log(`apply ${file} ...`);
  try {
    // .up.sql 内の BEGIN/COMMIT に任せる（二重 BEGIN を避ける）
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (version, dirty) VALUES ($1, false) ON CONFLICT (version) DO NOTHING",
      [version]
    );
    console.log(`ok ${file}`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

await client.end();
console.log("migrate-up: done");
