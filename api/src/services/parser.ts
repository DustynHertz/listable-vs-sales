import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse";
import * as XLSX from "xlsx";
import type { ListableRow, SoldRow, UploadType } from "../types";
import { mapHeaders, requireTrgid, type ColumnMap } from "../utils/headers";
import {
  blankToNull,
  facilityFromProgram,
  parseBoolean,
  parseDate,
  parseNumber,
  rewriteProgramName,
  shouldDropProgram,
} from "../utils/values";

export type ParsedRecord = ListableRow | SoldRow;

const LISTABLE_NUMBERS = new Set([
  "mr_lmr_upc_average_category_retail",
  "upc_retail",
]);
const SOLD_NUMBERS = new Set([
  "sale_price",
  "retail_price_on_sale_date",
  "mr_lmr_upc_average_category_retail",
  "upc_retail",
]);
const LISTABLE_DATES = new Set(["first_stored_on_listable_location_on"]);
const SOLD_DATES = new Set(["order_created_date"]);

function cellAt(row: unknown[], index: number): unknown {
  return row[index];
}

function coerceField(
  field: string,
  value: unknown,
  uploadType: UploadType,
): string | number | boolean | null {
  if (field === "location_not_listable") return parseBoolean(value);
  if (
    (uploadType === "listable" && LISTABLE_NUMBERS.has(field)) ||
    (uploadType === "sold" && SOLD_NUMBERS.has(field))
  ) {
    return parseNumber(value);
  }
  if (
    (uploadType === "listable" && LISTABLE_DATES.has(field)) ||
    (uploadType === "sold" && SOLD_DATES.has(field))
  ) {
    return parseDate(value);
  }
  return blankToNull(value);
}

export function rowFromCells(
  cells: unknown[],
  columns: ColumnMap,
  uploadType: UploadType,
): ParsedRecord | null {
  const record: Record<string, unknown> = {};
  for (const col of columns) {
    record[col.field] = coerceField(col.field, cellAt(cells, col.index), uploadType);
  }

  const trgid = blankToNull(record.trgid);
  if (!trgid) return null;

  record.trgid = trgid;
  record.program_name = rewriteProgramName(
    blankToNull(record.program_name as string | null),
  );
  if (shouldDropProgram(record.program_name as string | null)) return null;
  record.facility = facilityFromProgram(record.program_name as string | null);

  return record as unknown as ParsedRecord;
}



export async function* parseFile(
  filePath: string,
  uploadType: UploadType,
): AsyncGenerator<ParsedRecord> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".csv") {
    yield* parseCsv(filePath, uploadType);
    return;
  }
  if (ext === ".xlsx") {
    yield* parseXlsx(filePath, uploadType);
    return;
  }
  throw new Error("Please upload a .xlsx or .csv file.");
}

async function* parseCsv(
  filePath: string,
  uploadType: UploadType,
): AsyncGenerator<ParsedRecord> {
  const parser = fs.createReadStream(filePath).pipe(
    parse({
      bom: true,
      relaxColumnCount: true,
      skipEmptyLines: true,
      relaxQuotes: true,
    }),
  );

  let columns: ColumnMap | null = null;
  for await (const record of parser) {
    const cells = record as unknown[];
    if (!columns) {
      columns = mapHeaders(cells, uploadType);
      requireTrgid(columns);
      continue;
    }
    const row = rowFromCells(cells, columns, uploadType);
    if (row) yield row;
  }

  if (!columns) {
    throw new Error("The file is empty.");
  }
}

async function* parseXlsx(
  filePath: string,
  uploadType: UploadType,
): AsyncGenerator<ParsedRecord> {
  // SheetJS is used because some Recommerce exports break ExcelJS streaming/model parsers.
  const workbook = XLSX.readFile(filePath, {
    cellDates: true,
    dense: true,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("The workbook has no worksheets.");
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });

  if (rows.length === 0) {
    throw new Error("The file is empty.");
  }

  let columns: ColumnMap | null = null;
  for (const cells of rows) {
    if (!Array.isArray(cells)) continue;
    if (cells.every((c) => c === null || c === undefined || String(c).trim() === "")) {
      continue;
    }
    if (!columns) {
      columns = mapHeaders(cells, uploadType);
      requireTrgid(columns);
      continue;
    }
    const parsed = rowFromCells(cells, columns, uploadType);
    if (parsed) yield parsed;
  }

  if (!columns) {
    throw new Error("The file is empty.");
  }
}

export const LISTABLE_COPY_COLUMNS = [
  "row_num",
  "trgid",
  "upc",
  "title",
  "program_name",
  "master_program_name",
  "category_name",
  "manufacturer",
  "location_not_listable",
  "product_status",
  "mr_lmr_upc_average_category_retail",
  "upc_retail",
  "classification_physical_condition",
  "classification_condition",
  "classification_technical_functionality",
  "pallet_location_id",
  "rtv_type",
  "tag_not_listed_reason",
  "tag_venue_exclusivity",
  "serialized",
  "first_stored_on_listable_location_on",
  "facility",
] as const;

export const SOLD_COPY_COLUMNS = [
  "row_num",
  "trgid",
  "program_name",
  "master_program_name",
  "category_name",
  "manufacturer",
  "classification_physical_condition",
  "classification_condition",
  "rtv_type",
  "order_number",
  "sale_price",
  "retail_price_on_sale_date",
  "mr_lmr_upc_average_category_retail",
  "upc_retail",
  "order_type_sold_on",
  "marketplace_sold_on",
  "order_customer_name",
  "order_customer_company_name",
  "marketplace_po_number",
  "sorting_index",
  "location_id",
  "order_created_date",
  "facility",
] as const;

export function listableToCopyFields(row: ListableRow, rowNum: number): unknown[] {
  return [
    rowNum,
    row.trgid,
    row.upc,
    row.title,
    row.program_name,
    row.master_program_name,
    row.category_name,
    row.manufacturer,
    row.location_not_listable,
    row.product_status,
    row.mr_lmr_upc_average_category_retail,
    row.upc_retail,
    row.classification_physical_condition,
    row.classification_condition,
    row.classification_technical_functionality,
    row.pallet_location_id,
    row.rtv_type,
    row.tag_not_listed_reason,
    row.tag_venue_exclusivity,
    row.serialized,
    row.first_stored_on_listable_location_on,
    row.facility,
  ];
}

export function soldToCopyFields(row: SoldRow, rowNum: number): unknown[] {
  return [
    rowNum,
    row.trgid,
    row.program_name,
    row.master_program_name,
    row.category_name,
    row.manufacturer,
    row.classification_physical_condition,
    row.classification_condition,
    row.rtv_type,
    row.order_number,
    row.sale_price,
    row.retail_price_on_sale_date,
    row.mr_lmr_upc_average_category_retail,
    row.upc_retail,
    row.order_type_sold_on,
    row.marketplace_sold_on,
    row.order_customer_name,
    row.order_customer_company_name,
    row.marketplace_po_number,
    row.sorting_index,
    row.location_id,
    row.order_created_date,
    row.facility,
  ];
}
