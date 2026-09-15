import type { QueryFilters, UnitMode } from "./format";

export type JobStatus = {
  id: string;
  uploadType: "listable" | "sold";
  filename: string;
  status: string;
  progress: number;
  message: string | null;
  error: string | null;
  rowCount: number | null;
  createdAt: string;
  completedAt: string | null;
};

export type HistoryRow = {
  id: number;
  filename: string;
  uploadType: string;
  rowCount: number;
  uploadedAt: string;
};

export type ExecutiveKpis = {
  listableUnits: number;
  soldUnits: number;
  sellThrough: number | null;
  listableRetailValue: number;
  soldGmv: number;
  recovery: number | null;
};

export type ChartPoint = { date: string; produced: number; sold: number };

export type ScorecardRow = {
  facility: string;
  listable: number;
  sold: number;
  sellThrough: number | null;
  recovery: number | null;
  programs: Array<{
    program: string;
    listable: number;
    sold: number;
    sellThrough: number | null;
    recovery: number | null;
  }>;
};

export type NestedRow = {
  key: string;
  label: string;
  putawayQty: number;
  putawayGmv: number;
  soldQty: number;
  soldGmv: number;
  sellThrough: number | null;
  recovery?: number | null;
  children: Array<{
    key: string;
    label: string;
    putawayQty: number;
    putawayGmv: number;
    soldQty: number;
    soldGmv: number;
    sellThrough: number | null;
    recovery?: number | null;
  }>;
};

function qs(filters: QueryFilters, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.facility) params.set("facility", filters.facility);
  if (filters.masterProgram) params.set("masterProgram", filters.masterProgram);
  params.set("productType", filters.productType);
  if (filters.orderType) params.set("orderType", filters.orderType);
  if (filters.marketplace) params.set("marketplace", filters.marketplace);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return params.toString();
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error || "Request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  status: () => getJson<{ hasData: boolean; lastUploadAt: string | null }>("/api/uploads/status"),
  history: () => getJson<{ history: HistoryRow[] }>("/api/uploads/history"),
  job: (id: string) => getJson<JobStatus>(`/api/uploads/jobs/${id}`),
  filters: () =>
    getJson<{
      facilities: string[];
      masterPrograms: string[];
      orderTypes: string[];
      marketplaces: string[];
    }>("/api/metrics/filters"),
  executive: (f: QueryFilters) => getJson<ExecutiveKpis>(`/api/metrics/executive?${qs(f)}`),
  chart: (f: QueryFilters, mode: UnitMode) =>
    getJson<{ points: ChartPoint[] }>(`/api/metrics/chart?${qs(f, { mode })}`),
  scorecard: (f: QueryFilters, mode: UnitMode) =>
    getJson<{ rows: ScorecardRow[] }>(`/api/metrics/scorecard?${qs(f, { mode })}`),
  weeks: (f: QueryFilters) =>
    getJson<{ rows: NestedRow[]; totals: NestedRow }>(`/api/metrics/weeks?${qs(f)}`),
  categories: (f: QueryFilters) =>
    getJson<{ rows: NestedRow[]; totals: NestedRow }>(`/api/metrics/categories?${qs(f)}`),
  async upload(type: "listable" | "sold", file: File): Promise<JobStatus> {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`/api/uploads/${type}`, { method: "POST", body });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Upload failed");
    return json as JobStatus;
  },
  async clearAll(): Promise<void> {
    const res = await fetch("/api/uploads/data", { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error((json as { error?: string }).error || "Could not clear data");
    }
  },
};
