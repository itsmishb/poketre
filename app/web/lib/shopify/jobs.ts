import "server-only";
import { getPool } from "@/lib/db/pool";
import type { PoolClient } from "pg";

export type JobType =
  | "UPSERT_PRODUCT"
  | "UPDATE_INVENTORY"
  | "UNPUBLISH_PRODUCT"
  | "IMPORT_ORDERS";

export type JobRow = {
  job_id: number;
  job_type: JobType;
  card_id: string | null;
  payload: Record<string, unknown> | null;
  status: string;
  attempt: number;
};

export async function enqueueJob(
  jobType: JobType,
  cardId: string | null,
  payload: Record<string, unknown> = {},
  client?: PoolClient
): Promise<number> {
  const q = client ?? getPool();
  const { rows } = await q.query<{ job_id: number }>(
    `INSERT INTO shopify_sync_jobs (job_type, card_id, payload, status, next_run_at)
     VALUES ($1, $2, $3::jsonb, 'QUEUED', now())
     RETURNING job_id`,
    [jobType, cardId, JSON.stringify(payload)]
  );
  return rows[0].job_id;
}

export async function claimNextJob(): Promise<JobRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<JobRow>(
    `UPDATE shopify_sync_jobs
       SET status = 'RUNNING', attempt = attempt + 1, updated_at = now()
     WHERE job_id = (
       SELECT job_id FROM shopify_sync_jobs
        WHERE status IN ('QUEUED', 'RETRY')
          AND next_run_at <= now()
        ORDER BY next_run_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
     )
     RETURNING job_id, job_type, card_id, payload, status, attempt`
  );
  return rows[0] ?? null;
}

export async function markSucceeded(jobId: number): Promise<void> {
  await getPool().query(
    `UPDATE shopify_sync_jobs SET status = 'SUCCEEDED', last_error = NULL, updated_at = now() WHERE job_id = $1`,
    [jobId]
  );
}

const MAX_ATTEMPTS = 5;

export async function markFailed(jobId: number, attempt: number, error: string): Promise<"RETRY" | "FAILED"> {
  const giveUp = attempt >= MAX_ATTEMPTS;
  const status = giveUp ? "FAILED" : "RETRY";
  const backoffSeconds = Math.min(2 ** attempt * 30, 3600);
  await getPool().query(
    `UPDATE shopify_sync_jobs
       SET status = $1, last_error = $2,
           next_run_at = now() + ($3 || ' seconds')::interval,
           updated_at = now()
     WHERE job_id = $4`,
    [status, error, backoffSeconds.toString(), jobId]
  );
  return status;
}
