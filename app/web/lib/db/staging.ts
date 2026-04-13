import "server-only";
import { getPool } from "./pool";

export type StagingListRow = {
  id: string;
  serial_number: string | null;
  name_ja: string | null;
  set_code: string | null;
  rarity: string | null;
  qty: number;
  image_url: string | null;
  input_location_code?: string | null;
  duplicate_status?: "NONE" | "CANDIDATE" | "RESOLVED";
  duplicate_card_id?: string | null;
  merge_decision?: "MERGE_EXISTING" | "CREATE_NEW" | null;
  ocr_status?: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  status?: string;
};

export async function listPendingStaging(limit = 50): Promise<StagingListRow[]> {
  const pool = getPool();
  const r = await pool.query<StagingListRow>(
    `SELECT stg_id AS id, serial_number, name_ja, set_code, rarity, qty, image_url,
            input_location_code, duplicate_status, duplicate_card_id, merge_decision, ocr_status, status
     FROM ocr_staging
     WHERE status = ANY($1::text[])
     ORDER BY created_at DESC
     LIMIT $2`,
    [["登録待ち", "OCR中", "OCR失敗"], limit]
  );
  return r.rows;
}

export async function countPendingStaging(): Promise<number> {
  const pool = getPool();
  const r = await pool.query<{ c: number }>(
    `SELECT count(*)::int AS c FROM ocr_staging WHERE status = ANY($1::text[])`,
    [["登録待ち", "OCR中", "OCR失敗"]]
  );
  return r.rows[0]?.c ?? 0;
}

export type StagingDetailRow = {
  id: string;
  file_name: string | null;
  image_url: string | null;
  serial_number: string | null;
  name_ja: string | null;
  set_code: string | null;
  card_number_text: string | null;
  rarity: string | null;
  card_type: string | null;
  qty: number | null;
  input_location_code: string | null;
  duplicate_status: "NONE" | "CANDIDATE" | "RESOLVED";
  duplicate_card_id: string | null;
  merge_decision: "MERGE_EXISTING" | "CREATE_NEW" | null;
  ocr_status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
  status: string;
};

export async function getStagingByStgId(
  stgId: string
): Promise<StagingDetailRow | null> {
  const pool = getPool();
  const r = await pool.query<StagingDetailRow>(
    `SELECT stg_id AS id, file_name, image_url, serial_number, name_ja, set_code, card_number_text,
            rarity, card_type, qty, input_location_code, duplicate_status, duplicate_card_id, merge_decision,
            ocr_status, status
     FROM ocr_staging WHERE stg_id = $1`,
    [stgId]
  );
  return r.rows[0] ?? null;
}

type ImportFile = {
  file_name: string;
  image_url: string | null;
};

export type ImportResultRow = {
  stg_id: string;
  serial_number: string | null;
  duplicate_status: "NONE" | "CANDIDATE";
  duplicate_card_id: string | null;
};

function normalizeFileBaseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").trim();
}

function extractSerialFromName(fileName: string): string | null {
  const base = normalizeFileBaseName(fileName).toUpperCase();
  const m = /([A-Z0-9]+)[_\- ]?(\d{1,3})[\/_\-](\d{1,3})/.exec(base);
  if (!m) return null;
  return `${m[1]}_${m[2].padStart(3, "0")}/${m[3].padStart(3, "0")}`;
}

function toSetAndCardText(serial: string | null): { set_code: string | null; card_number_text: string | null } {
  if (!serial || !serial.includes("_")) return { set_code: null, card_number_text: null };
  const [setCode, cardText] = serial.split("_");
  return {
    set_code: setCode?.toUpperCase() ?? null,
    card_number_text: cardText ?? null,
  };
}

async function resolveDuplicateCardId(
  serialNumber: string | null,
  setCode: string | null,
  cardNumberText: string | null
): Promise<string | null> {
  const pool = getPool();
  const serialAsCardId = serialNumber?.replace(/\//g, "/");
  const r = await pool.query<{ card_id: string }>(
    `SELECT card_id
     FROM cards
     WHERE ($1::text IS NOT NULL AND card_id = $1)
        OR ($2::text IS NOT NULL AND $3::text IS NOT NULL AND set_code = $2 AND card_number_text = $3)
     ORDER BY updated_at DESC
     LIMIT 1`,
    [serialAsCardId, setCode, cardNumberText]
  );
  return r.rows[0]?.card_id ?? null;
}

export async function createWebUploadStagingRows(opts: {
  files: ImportFile[];
  input_location_code: string;
  reviewer_id?: string;
}): Promise<{ batch_id: string; rows: ImportResultRow[] }> {
  const pool = getPool();
  const batchId = `batch_${Date.now().toString(36)}`;
  const rows: ImportResultRow[] = [];

  for (let i = 0; i < opts.files.length; i += 1) {
    const file = opts.files[i];
    const stgId = `stg_upload_${Date.now().toString(36)}_${i}`;
    const driveFileId = `web_upload_${Date.now().toString(36)}_${i}`;
    const serial = extractSerialFromName(file.file_name);
    const { set_code, card_number_text } = toSetAndCardText(serial);
    const duplicateCardId = await resolveDuplicateCardId(serial, set_code, card_number_text);
    const duplicateStatus: "NONE" | "CANDIDATE" = duplicateCardId ? "CANDIDATE" : "NONE";

    await pool.query(
      `INSERT INTO ocr_staging (
        stg_id, drive_file_id, file_name, image_url, ai_json, status, review_status,
        serial_number, set_code, card_number_text, name_ja, qty,
        batch_id, source, input_location_code, duplicate_status, duplicate_card_id, merge_decision
      ) VALUES (
        $1, $2, $3, $4, $5::jsonb, '登録待ち', 'PENDING',
        $6, $7, $8, $9, 1,
        $10, 'WEB_UPLOAD', $11, $12, $13, $14
      )`,
      [
        stgId,
        driveFileId,
        file.file_name,
        file.image_url,
        JSON.stringify({ upload_source: "web", ocr_pending: true }),
        serial,
        set_code,
        card_number_text,
        normalizeFileBaseName(file.file_name),
        batchId,
        opts.input_location_code,
        duplicateStatus,
        duplicateCardId,
        duplicateCardId ? "MERGE_EXISTING" : "CREATE_NEW",
      ]
    );

    rows.push({
      stg_id: stgId,
      serial_number: serial,
      duplicate_status: duplicateStatus,
      duplicate_card_id: duplicateCardId,
    });
  }

  return { batch_id: batchId, rows };
}

export async function updateStagingMergeDecision(opts: {
  stg_id: string;
  merge_decision: "MERGE_EXISTING" | "CREATE_NEW";
  duplicate_card_id?: string | null;
  input_location_code?: string | null;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE ocr_staging
       SET merge_decision = $2,
           duplicate_card_id = CASE WHEN $3::text = '' THEN NULL ELSE $3 END,
           input_location_code = COALESCE($4, input_location_code),
           duplicate_status = CASE WHEN $2 = 'MERGE_EXISTING' THEN 'RESOLVED' ELSE duplicate_status END
     WHERE stg_id = $1`,
    [opts.stg_id, opts.merge_decision, opts.duplicate_card_id ?? null, opts.input_location_code ?? null]
  );
}

export async function approveStagingRow(
  stgId: string,
  opts: {
    initial_qty: number;
    condition_grade: string;
    approved_inventory_type: string;
    reviewer_id: string;
    merge_decision?: "MERGE_EXISTING" | "CREATE_NEW" | null;
    duplicate_card_id?: string | null;
    input_location_code?: string | null;
  }
): Promise<void> {
  function parseLocation(code: string): { tier: number; box: number; col: number } | null {
    const m = /^(\d+)-(\d+)-(\d+)$/.exec(code.trim());
    if (!m) return null;
    return { tier: Number(m[1]), box: Number(m[2]), col: Number(m[3]) };
  }
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rowRes = await client.query<{
      serial_number: string | null;
      set_code: string | null;
      card_number_text: string | null;
      name_ja: string | null;
      card_type: string | null;
      duplicate_card_id: string | null;
      merge_decision: "MERGE_EXISTING" | "CREATE_NEW" | null;
      input_location_code: string | null;
      qty: number;
    }>(
      `SELECT serial_number, set_code, card_number_text, name_ja, card_type,
              duplicate_card_id, merge_decision, input_location_code, qty
       FROM ocr_staging WHERE stg_id = $1 FOR UPDATE`,
      [stgId]
    );
    const row = rowRes.rows[0];
    if (!row) throw new Error("staging row not found");

    const decision = opts.merge_decision ?? row.merge_decision ?? "CREATE_NEW";
    const duplicateCardId = opts.duplicate_card_id ?? row.duplicate_card_id ?? null;
    const locationCode = opts.input_location_code ?? row.input_location_code ?? null;
    let resolvedStorageLocationId: string | null = null;
    if (locationCode) {
      const p = parseLocation(locationCode);
      if (p) {
        const lr = await client.query<{ storage_location_id: string }>(
          `SELECT storage_location_id
             FROM storage_locations
            WHERE tier = $1 AND pos = $2 AND slot = $3
            LIMIT 1`,
          [p.tier, p.box, String(p.col)]
        );
        resolvedStorageLocationId = lr.rows[0]?.storage_location_id ?? null;
      }
    }
    let cardId: string;

    if (decision === "MERGE_EXISTING" && duplicateCardId) {
      cardId = duplicateCardId;
    } else {
      const setCode = (row.set_code || "UNKNOWN").toUpperCase();
      await client.query(
        `INSERT INTO sets (set_code, set_name_ja)
         VALUES ($1, $1)
         ON CONFLICT (set_code) DO NOTHING`,
        [setCode]
      );

      const fallbackCardId = `${setCode}_${row.card_number_text ?? "000/000"}`;
      cardId = row.serial_number || fallbackCardId;
      const cardType =
        row.card_type && ["ポケモン", "トレーナーズ", "エネルギー", "その他"].includes(row.card_type)
          ? row.card_type
          : "その他";
      const cardName = row.name_ja || row.serial_number || "OCR取込カード";

      await client.query(
        `INSERT INTO cards (card_id, set_code, name_ja, card_type, card_number_text)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (card_id) DO NOTHING`,
        [cardId, setCode, cardName, cardType, row.card_number_text]
      );
    }

    if (opts.approved_inventory_type === "LOT") {
      await client.query(
        `INSERT INTO inventory_lots (card_id, condition_grade, qty_on_hand, status, storage_location_id)
         VALUES ($1, $2, $3, 'IN_STOCK', $4)`,
        [cardId, opts.condition_grade, Math.max(1, opts.initial_qty), resolvedStorageLocationId]
      );
    } else {
      const qty = Math.max(1, opts.initial_qty);
      for (let i = 0; i < qty; i += 1) {
        await client.query(
          `INSERT INTO inventory_units (card_id, condition_grade, status, serial_number, memo, storage_location_id)
           VALUES ($1, $2, 'IN_STOCK', $3, $4, $5)`,
          [
            cardId,
            opts.condition_grade,
            row.serial_number,
            locationCode ? `location_code=${locationCode}` : null,
            resolvedStorageLocationId,
          ]
        );
      }
    }

    await client.query(
      `UPDATE ocr_staging SET
        review_status = 'APPROVED',
        status = '確定',
        approved_at = now(),
        initial_qty = $2,
        initial_condition = $3,
        approved_inventory_type = $4,
        reviewer_id = $5,
        merge_decision = $6,
        duplicate_card_id = CASE WHEN $7::text = '' THEN NULL ELSE $7 END,
        input_location_code = COALESCE($8, input_location_code),
        duplicate_status = CASE WHEN $6 = 'MERGE_EXISTING' THEN 'RESOLVED' ELSE duplicate_status END,
        resolved_storage_location_id = COALESCE($9, resolved_storage_location_id),
        confirmed_at = now()
      WHERE stg_id = $1`,
      [
        stgId,
        opts.initial_qty,
        opts.condition_grade,
        opts.approved_inventory_type,
        opts.reviewer_id,
        decision,
        duplicateCardId,
        locationCode,
        resolvedStorageLocationId,
      ]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function rejectStagingRow(
  stgId: string,
  review_status: string,
  reviewer_id: string
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE ocr_staging SET review_status = $2, reviewer_id = $3 WHERE stg_id = $1`,
    [stgId, review_status, reviewer_id]
  );
}
