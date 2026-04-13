import "server-only";
import { getPool } from "./pool";

export type QueuedImportItem = {
  fileName: string;
  gcsBucket: string;
  gcsObjectPath: string;
  publicImageUrl: string;
};

export async function createQueuedOcrJobs(opts: {
  batchId: string;
  createdBy: string;
  inputLocationCode: string;
  items: QueuedImportItem[];
}): Promise<{ jobIds: string[]; stagingIds: string[] }> {
  const pool = getPool();
  const client = await pool.connect();
  const jobIds: string[] = [];
  const stagingIds: string[] = [];
  try {
    await client.query("BEGIN");
    for (let i = 0; i < opts.items.length; i += 1) {
      const item = opts.items[i];
      const job = await client.query<{ job_id: string }>(
        `INSERT INTO ocr_jobs (
           batch_id, source, gcs_bucket, gcs_object_path, status, created_by
         ) VALUES ($1, 'WEB_UPLOAD', $2, $3, 'QUEUED', $4)
         RETURNING job_id`,
        [opts.batchId, item.gcsBucket, item.gcsObjectPath, opts.createdBy]
      );
      const jobId = job.rows[0].job_id;
      const stgId = `stg_job_${jobId}`;
      await client.query(
        `INSERT INTO ocr_staging (
           stg_id, drive_file_id, file_name, image_url, ai_json,
           status, review_status, qty, batch_id, source, input_location_code,
           duplicate_status, merge_decision, ocr_job_id, ocr_status, reviewer_id
         ) VALUES (
           $1, $2, $3, $4, $5::jsonb,
           'OCR中', 'PENDING', 1, $6, 'WEB_UPLOAD', $7,
           'NONE', NULL, $8, 'PENDING', $9
         )`,
        [
          stgId,
          `job_${jobId}`,
          item.fileName,
          item.publicImageUrl,
          JSON.stringify({ upload_source: "web", ocr_pending: true }),
          opts.batchId,
          opts.inputLocationCode,
          jobId,
          opts.createdBy,
        ]
      );
      jobIds.push(jobId);
      stagingIds.push(stgId);
    }
    await client.query("COMMIT");
    return { jobIds, stagingIds };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
