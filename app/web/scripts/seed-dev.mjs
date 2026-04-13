#!/usr/bin/env node
/**
 * psql 無しで dev_seed.sql を流す。
 * 使い方: DATABASE_URL=... node scripts/seed-dev.mjs
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const seedPath = path.join(repoRoot, "db/seeds/dev_seed.sql");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL を設定してください。");
  process.exit(1);
}

const sql = await readFile(seedPath, "utf8");
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(sql);
  console.log("seed-dev: ok");
} finally {
  await client.end();
}
