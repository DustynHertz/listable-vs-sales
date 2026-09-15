import { DROP_PROGRAMS, PROGRAM_REWRITES } from "../types";

export function normalizeHeader(header: unknown): string {
  return String(header ?? "")
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[\s_]/g, "");
}

export function blankToNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  const s = String(value)
    .trim()
    .replace(/\$/g, "")
    .replace(/,/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseBoolean(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 0) return false;
    if (value === 1) return true;
    return null;
  }
  const s = String(value).trim().toLowerCase();
  if (["false", "0", "no", "n", "f"].includes(s)) return false;
  if (["true", "1", "yes", "y", "t"].includes(s)) return true;
  return null;
}

export function excelSerialToISODate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const whole = Math.floor(serial);
  const utc = Date.UTC(1899, 11, 30) + whole * 86_400_000;
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(year: number, month: number, day: number): string | null {
  if (!year || !month || !day) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  if (typeof value === "number") {
    return excelSerialToISODate(value);
  }
  const s = String(value).trim();
  if (s === "") return null;

  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return ymd(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const mdy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (mdy) return ymd(Number(mdy[3]), Number(mdy[1]), Number(mdy[2]));

  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum > 20000 && asNum < 100000) {
    return excelSerialToISODate(asNum);
  }

  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
  }
  return null;
}

export function rewriteProgramName(programName: string | null): string | null {
  if (!programName) return null;
  const key = Object.keys(PROGRAM_REWRITES).find(
    (k) => k.toLowerCase() === programName.toLowerCase(),
  );
  return key ? PROGRAM_REWRITES[key] : programName;
}

export function shouldDropProgram(programName: string | null): boolean {
  if (!programName) return false;
  return DROP_PROGRAMS.some((p) => p.toLowerCase() === programName.toLowerCase());
}

export function facilityFromProgram(programName: string | null): string | null {
  if (!programName) return null;
  const idx = programName.indexOf("-");
  const prefix = idx === -1 ? programName : programName.slice(0, idx);
  const facility = prefix.trim().toUpperCase();
  return facility === "" ? null : facility;
}

export function csvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "boolean" ? (value ? "true" : "false") : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
