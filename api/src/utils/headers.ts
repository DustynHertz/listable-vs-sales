import type { UploadType } from "../types";
import { LISTABLE_HEADERS, SOLD_HEADERS } from "../types";
import { normalizeHeader } from "./values";

export type ColumnMap = Array<{ index: number; field: string }>;

export function mapHeaders(
  headers: unknown[],
  uploadType: UploadType,
): ColumnMap {
  const lookup = uploadType === "listable" ? LISTABLE_HEADERS : SOLD_HEADERS;
  const mapped: ColumnMap = [];
  const seen = new Set<string>();

  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    const field = lookup[key];
    if (!field || seen.has(field)) return;
    seen.add(field);
    mapped.push({ index, field });
  });

  return mapped;
}

export function requireTrgid(columns: ColumnMap): void {
  if (!columns.some((c) => c.field === "trgid")) {
    throw new Error(
      "The file is missing a TRGID column. Check that the header row matches the expected template.",
    );
  }
}
