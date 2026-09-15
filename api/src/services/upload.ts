import fs from "node:fs";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import type { PoolClient } from "pg";
import { from as copyFrom } from "pg-copy-streams";
import type { UploadType } from "../types";
import { pool } from "../db/pool";
import { csvField } from "../utils/values";
import {
  LISTABLE_COPY_COLUMNS,
  SOLD_COPY_COLUMNS,
  listableToCopyFields,
  parseFile,
  soldToCopyFields,
} from "./parser";
import type { ListableRow, SoldRow } from "../types";

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

const LISTABLE_STAGE_SQL = `
CREATE TEMP TABLE stage (
  row_num BIGINT,
  trgid TEXT,
  upc TEXT,
  title TEXT,
  program_name TEXT,
  master_program_name TEXT,
  category_name TEXT,
  manufacturer TEXT,
  location_not_listable BOOLEAN,
  product_status TEXT,
  mr_lmr_upc_average_category_retail NUMERIC,
  upc_retail NUMERIC,
  classification_physical_condition TEXT,
  classification_condition TEXT,
  classification_technical_functionality TEXT,
  pallet_location_id TEXT,
  rtv_type TEXT,
  tag_not_listed_reason TEXT,
  tag_venue_exclusivity TEXT,
  serialized TEXT,
  first_stored_on_listable_location_on DATE,
  facility TEXT
) ON COMMIT DROP
`;

const SOLD_STAGE_SQL = `
CREATE TEMP TABLE stage (
  row_num BIGINT,
  trgid TEXT,
  program_name TEXT,
  master_program_name TEXT,
  category_name TEXT,
  manufacturer TEXT,
  classification_physical_condition TEXT,
  classification_condition TEXT,
  rtv_type TEXT,
  order_number TEXT,
  sale_price NUMERIC,
  retail_price_on_sale_date NUMERIC,
  mr_lmr_upc_average_category_retail NUMERIC,
  upc_retail NUMERIC,
  order_type_sold_on TEXT,
  marketplace_sold_on TEXT,
  order_customer_name TEXT,
  order_customer_company_name TEXT,
  marketplace_po_number TEXT,
  sorting_index TEXT,
  location_id TEXT,
  order_created_date DATE,
  facility TEXT
) ON COMMIT DROP
`;

const LISTABLE_UPSERT_SQL = `
INSERT INTO inventory_items (
  trgid, has_putaway, upc, title, program_name, master_program_name, category_name,
  manufacturer, location_not_listable, product_status,
  mr_lmr_upc_average_category_retail, upc_retail,
  classification_physical_condition, classification_condition,
  classification_technical_functionality, pallet_location_id, rtv_type,
  tag_not_listed_reason, tag_venue_exclusivity, serialized,
  first_stored_on_listable_location_on, facility, updated_at
)
SELECT
  trgid, TRUE, upc, title, program_name, master_program_name, category_name,
  manufacturer, location_not_listable, product_status,
  mr_lmr_upc_average_category_retail, upc_retail,
  classification_physical_condition, classification_condition,
  classification_technical_functionality, pallet_location_id, rtv_type,
  tag_not_listed_reason, tag_venue_exclusivity, serialized,
  first_stored_on_listable_location_on, facility, NOW()
FROM (
  SELECT DISTINCT ON (trgid) *
  FROM stage
  ORDER BY trgid, row_num DESC
) s
ON CONFLICT (trgid) DO UPDATE SET
  has_putaway = TRUE,
  upc = EXCLUDED.upc,
  title = EXCLUDED.title,
  program_name = EXCLUDED.program_name,
  master_program_name = EXCLUDED.master_program_name,
  category_name = EXCLUDED.category_name,
  manufacturer = EXCLUDED.manufacturer,
  location_not_listable = EXCLUDED.location_not_listable,
  product_status = EXCLUDED.product_status,
  mr_lmr_upc_average_category_retail = EXCLUDED.mr_lmr_upc_average_category_retail,
  upc_retail = EXCLUDED.upc_retail,
  classification_physical_condition = EXCLUDED.classification_physical_condition,
  classification_condition = EXCLUDED.classification_condition,
  classification_technical_functionality = EXCLUDED.classification_technical_functionality,
  pallet_location_id = EXCLUDED.pallet_location_id,
  rtv_type = EXCLUDED.rtv_type,
  tag_not_listed_reason = EXCLUDED.tag_not_listed_reason,
  tag_venue_exclusivity = EXCLUDED.tag_venue_exclusivity,
  serialized = EXCLUDED.serialized,
  first_stored_on_listable_location_on = EXCLUDED.first_stored_on_listable_location_on,
  facility = EXCLUDED.facility,
  updated_at = NOW()
`;

const SOLD_UPSERT_SQL = `
INSERT INTO inventory_items (
  trgid, has_sold_upload, program_name_sold, master_program_name_sold, category_name_sold,
  manufacturer_sold, classification_physical_condition_sold, classification_condition_sold,
  rtv_type_sold, order_number, sale_price, retail_price_on_sale_date,
  mr_lmr_upc_average_category_retail_sold, upc_retail_sold, order_type_sold_on,
  marketplace_sold_on, order_customer_name, order_customer_company_name,
  marketplace_po_number, sorting_index, location_id, order_created_date, facility_sold,
  updated_at
)
SELECT
  trgid, TRUE, program_name, master_program_name, category_name,
  manufacturer, classification_physical_condition, classification_condition,
  rtv_type, order_number, sale_price, retail_price_on_sale_date,
  mr_lmr_upc_average_category_retail, upc_retail, order_type_sold_on,
  marketplace_sold_on, order_customer_name, order_customer_company_name,
  marketplace_po_number, sorting_index, location_id, order_created_date, facility,
  NOW()
FROM (
  SELECT DISTINCT ON (trgid) *
  FROM stage
  ORDER BY trgid, row_num DESC
) s
ON CONFLICT (trgid) DO UPDATE SET
  has_sold_upload = TRUE,
  program_name_sold = EXCLUDED.program_name_sold,
  master_program_name_sold = EXCLUDED.master_program_name_sold,
  category_name_sold = EXCLUDED.category_name_sold,
  manufacturer_sold = EXCLUDED.manufacturer_sold,
  classification_physical_condition_sold = EXCLUDED.classification_physical_condition_sold,
  classification_condition_sold = EXCLUDED.classification_condition_sold,
  rtv_type_sold = EXCLUDED.rtv_type_sold,
  order_number = EXCLUDED.order_number,
  sale_price = EXCLUDED.sale_price,
  retail_price_on_sale_date = EXCLUDED.retail_price_on_sale_date,
  mr_lmr_upc_average_category_retail_sold = EXCLUDED.mr_lmr_upc_average_category_retail_sold,
  upc_retail_sold = EXCLUDED.upc_retail_sold,
  order_type_sold_on = EXCLUDED.order_type_sold_on,
  marketplace_sold_on = EXCLUDED.marketplace_sold_on,
  order_customer_name = EXCLUDED.order_customer_name,
  order_customer_company_name = EXCLUDED.order_customer_company_name,
  marketplace_po_number = EXCLUDED.marketplace_po_number,
  sorting_index = EXCLUDED.sorting_index,
  location_id = EXCLUDED.location_id,
  order_created_date = EXCLUDED.order_created_date,
  facility_sold = EXCLUDED.facility_sold,
  updated_at = NOW()
`;

async function copyRecords(
  client: PoolClient,
  uploadType: UploadType,
  filePath: string,
  jobId: string,
): Promise<number> {
  const columns =
    uploadType === "listable" ? LISTABLE_COPY_COLUMNS : SOLD_COPY_COLUMNS;
  const copySql = `COPY stage (${columns.join(", ")}) FROM STDIN WITH (FORMAT csv, NULL '')`;
  const copyStream = client.query(copyFrom(copySql));

  let rowNum = 0;
  let lastProgress = Date.now();

  try {
    for await (const record of parseFile(filePath, uploadType)) {
      rowNum += 1;
      const fields =
        uploadType === "listable"
          ? listableToCopyFields(record as ListableRow, rowNum)
          : soldToCopyFields(record as SoldRow, rowNum);
      const line = fields.map((v) => csvField(v as never)).join(",") + "\n";
      if (!copyStream.write(line)) {
        await once(copyStream, "drain");
      }
      if (rowNum % 5000 === 0 && Date.now() - lastProgress > 400) {
        lastProgress = Date.now();
        const pct = Math.min(75, 15 + Math.floor((rowNum / 5000) * 2));
        await updateJob(jobId, {
          status: "parsing",
          progress: pct,
          message: `Parsed ${rowNum.toLocaleString()} rows…`,
        });
      }
    }

    copyStream.end();
    await finished(copyStream);
    return rowNum;
  } catch (err) {
    copyStream.destroy();
    throw err;
  }
}

export async function processUpload(
  jobId: string,
  uploadType: UploadType,
  filename: string,
  filePath: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await updateJob(jobId, {
      status: "parsing",
      progress: 10,
      message: "Parsing file on the server…",
    });
    await client.query("BEGIN");
    await client.query(uploadType === "listable" ? LISTABLE_STAGE_SQL : SOLD_STAGE_SQL);

    const staged = await copyRecords(client, uploadType, filePath, jobId);
    if (staged === 0) {
      throw new Error(
        "No rows were imported. Check that TRGID is populated and ProgramName is not on the exclusion list.",
      );
    }

    await updateJob(jobId, {
      status: "committing",
      progress: 85,
      message: `Staging ${staged.toLocaleString()} rows. Committing in one transaction…`,
    });

    const upsert = await client.query(
      uploadType === "listable" ? LISTABLE_UPSERT_SQL : SOLD_UPSERT_SQL,
    );
    const committed = upsert.rowCount ?? 0;

    await client.query(
      `INSERT INTO upload_history (filename, upload_type, row_count)
       VALUES ($1, $2, $3)`,
      [filename, uploadType, committed],
    );
    await client.query("COMMIT");

    await updateJob(jobId, {
      status: "completed",
      progress: 100,
      message: `Imported ${committed.toLocaleString()} unique TRGID rows.`,
      rowCount: committed,
      completed: true,
    });
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* already aborted */
    }
    const message =
      err instanceof Error ? err.message : "Upload failed for an unknown reason.";
    await updateJob(jobId, {
      status: "failed",
      progress: 0,
      error: message,
      message: "Import rolled back. No rows from this file were saved.",
      completed: true,
    });
  } finally {
    client.release();
    await fs.promises.unlink(filePath).catch(() => undefined);
  }
}
