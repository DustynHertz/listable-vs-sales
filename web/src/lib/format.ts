export type ProductType = "Non-RTV" | "RTV" | "All";
export type UnitMode = "units" | "pallets";
export type DatePreset = "yesterday" | "7d" | "30d" | "all" | "custom";

export type QueryFilters = {
  from: string | null;
  to: string | null;
  facility: string;
  masterProgram: string;
  productType: ProductType;
  orderType: string;
  marketplace: string;
};

export function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function isoUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addUtcDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

export function rangeFromPreset(preset: DatePreset, customFrom: string, customTo: string): {
  from: string | null;
  to: string | null;
} {
  const today = utcToday();
  const yesterday = addUtcDays(today, -1);
  if (preset === "yesterday") return { from: isoUTC(yesterday), to: isoUTC(yesterday) };
  if (preset === "7d") return { from: isoUTC(addUtcDays(today, -6)), to: isoUTC(today) };
  if (preset === "30d") return { from: isoUTC(addUtcDays(today, -29)), to: isoUTC(today) };
  if (preset === "all") return { from: null, to: null };
  return { from: customFrom || null, to: customTo || null };
}

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function formatMoney(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toLocaleString("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  })}%`;
}

export function sellThroughTone(value: number | null): "red" | "orange" | "ok" | "empty" {
  if (value === null || value === undefined) return "empty";
  if (value < 0.6) return "red";
  if (value < 0.9) return "orange";
  return "ok";
}

export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const esc = (v: string | number) => {
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
