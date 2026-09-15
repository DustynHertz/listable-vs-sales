import fs from "node:fs";
import type { UploadType } from "../types";
import { pool } from "../db/pool";
import { parseFile } from "./parser";
import type { ListableRow, SoldRow } from "../types";
import {
  BATCH,
  upsertListableBatch,
  upsertSoldBatch,
} from "./streamUpsert";

export type JobStatus = {
  id: string;
  uploadType: UploadType;
  filename: string;
  status: string;
  progress: number;
  message: string | null;
  error: string | null;
  rowCount: number | null;
  createdAt: string;
  completedAt: string | null;
};

async function updateJob(
  id: string,
  fields: {
    status?: string;
    progress?: number;
    message?: string | null;
    error?: string | null;
    rowCount?: number | null;
    completed?: boolean;
  },
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (fields.status !== undefined) {
    sets.push(`status = $${i++}`);
    values.push(fields.status);
  }
  if (fields.progress !== undefined) {
    sets.push(`progress = $${i++}`);
    values.push(fields.progress);
  }
  if (fields.message !== undefined) {
    sets.push(`message = $${i++}`);
    values.push(fields.message);
  }
  if (fields.error !== undefined) {
    sets.push(`error = $${i++}`);
    values.push(fields.error);
  }
  if (fields.rowCount !== undefined) {
    sets.push(`row_count = $${i++}`);
    values.push(fields.rowCount);
  }
  if (fields.completed) {
    sets.push(`completed_at = NOW()`);
  }
  if (sets.length === 0) return;
  values.push(id);
  await pool.query(
    `UPDATE upload_jobs SET ${sets.join(", ")} WHERE id = $${i}`,
    values,
  );
}

function mapJob(row: Record<string, unknown>): JobStatus {
  return {
    id: String(row.id),
    uploadType: row.upload_type as UploadType,
    filename: String(row.filename),
    status: String(row.status),
    progress: Number(row.progress),
    message: (row.message as string) ?? null,
    error: (row.error as string) ?? null,
    rowCount: row.row_count === null || row.row_count === undefined ? null : Number(row.row_count),
    createdAt: new Date(row.created_at as string).toISOString(),
    completedAt: row.completed_at
      ? new Date(row.completed_at as string).toISOString()
      : null,
  };
}

export async function createJob(
  id: string,
  uploadType: UploadType,
  filename: string,
): Promise<JobStatus> {
  const result = await pool.query(
    `INSERT INTO upload_jobs (id, upload_type, filename, status, progress, message)
     VALUES ($1, $2, $3, 'queued', 0, 'File received. Waiting to parse.')
     RETURNING *`,
    [id, uploadType, filename],
  );
  return mapJob(result.rows[0]);
}

export async function getJob(id: string): Promise<JobStatus | null> {
  const result = await pool.query(`SELECT * FROM upload_jobs WHERE id = $1`, [id]);
  if (result.rows.length === 0) return null;
  return mapJob(result.rows[0]);
}

export async function listHistory(): Promise<
  Array<{
    id: number;
    filename: string;
    uploadType: string;
    rowCount: number;
    uploadedAt: string;
  }>
> {
  const result = await pool.query(
    `SELECT id, filename, upload_type, row_count, uploaded_at
     FROM upload_history
     ORDER BY uploaded_at DESC
     LIMIT 200`,
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    filename: String(row.filename),
    uploadType: String(row.upload_type),
    rowCount: Number(row.row_count),
    uploadedAt: new Date(row.uploaded_at).toISOString(),
  }));
}

export async function clearAllData(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE inventory_items");
    await client.query("TRUNCATE upload_history RESTART IDENTITY");
    await client.query("TRUNCATE upload_jobs");
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function processUpload(
  jobId: string,
  uploadType: UploadType,
  filename: string,
  filePath: string,
): Promise<void> {
  const client = await pool.connect();
  client.on("error", (err) => {
    console.error("Postgres client error during upload", err);
  });
  try {
    await updateJob(jobId, {
      status: "parsing",
      progress: 5,
      message: "Parsing file on the server…",
    });

    // Last-row-wins in memory, then batch upsert. Avoids huge Postgres temp tables
    // that exhaust Railway Hobby disk (0.5 GB).
    const byTrgid = new Map<string, ListableRow | SoldRow>();
    let seen = 0;
    let lastProgress = Date.now();
    for await (const record of parseFile(filePath, uploadType)) {
      seen += 1;
      byTrgid.set(record.trgid, record);
      if (seen % 5000 === 0 && Date.now() - lastProgress > 800) {
        lastProgress = Date.now();
        void updateJob(jobId, {
          status: "parsing",
          progress: Math.min(40, 5 + Math.floor(seen / 5000)),
          message: `Parsed ${seen.toLocaleString()} rows (${byTrgid.size.toLocaleString()} unique TRGIDs)…`,
        }).catch(() => undefined);
      }
    }

    if (byTrgid.size === 0) {
      throw new Error(
        "No rows were imported. Check that TRGID is populated and ProgramName is not on the exclusion list.",
      );
    }

    const rows = Array.from(byTrgid.values());
    await updateJob(jobId, {
      status: "committing",
      progress: 45,
      message: `Committing ${rows.length.toLocaleString()} unique TRGIDs in batches…`,
    });

    let committed = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = 0");
      try {
        if (uploadType === "listable") {
          committed += await upsertListableBatch(client, chunk as ListableRow[]);
        } else {
          committed += await upsertSoldBatch(client, chunk as SoldRow[]);
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
      const pct = Math.min(98, 45 + Math.floor((committed / rows.length) * 50));
      void updateJob(jobId, {
        status: "committing",
        progress: pct,
        message: `Committed ${committed.toLocaleString()} / ${rows.length.toLocaleString()} TRGIDs…`,
      }).catch(() => undefined);
    }

    await client.query(
      `INSERT INTO upload_history (filename, upload_type, row_count)
       VALUES ($1, $2, $3)`,
      [filename, uploadType, committed],
    );

    await updateJob(jobId, {
      status: "completed",
      progress: 100,
      message: `Imported ${committed.toLocaleString()} unique TRGID rows.`,
      rowCount: committed,
      completed: true,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Upload failed for an unknown reason.";
    await updateJob(jobId, {
      status: "failed",
      progress: 0,
      error: message,
      message: "Import failed. Already-committed batches (if any) were kept.",
      completed: true,
    });
  } finally {
    client.release();
    await fs.promises.unlink(filePath).catch(() => undefined);
  }
}
