import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  History,
  PackagePlus,
  ShoppingCart,
  Trash2,
  Upload,
} from "lucide-react";
import { api, type ExecutiveKpis, type HistoryRow, type JobStatus, type NestedRow, type ScorecardRow } from "@/lib/api";
import {
  formatMoney,
  formatNumber,
  formatPct,
  rangeFromPreset,
  sellThroughTone,
  type DatePreset,
  type ProductType,
  type QueryFilters,
  type UnitMode,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NestedTable } from "@/components/NestedTable";
import { TrendChart } from "@/components/TrendChart";

const emptyKpis: ExecutiveKpis = {
  listableUnits: 0,
  soldUnits: 0,
  sellThrough: null,
  listableRetailValue: 0,
  soldGmv: 0,
  recovery: null,
};

function Segmented({
  value,
  onChange,
}: {
  value: UnitMode;
  onChange: (mode: UnitMode) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
      {(["units", "pallets"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          className={`rounded px-2.5 py-1 capitalize ${
            value === mode ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-600"
          }`}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [preset, setPreset] = useState<DatePreset>("yesterday");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [facility, setFacility] = useState("");
  const [masterProgram, setMasterProgram] = useState("");
  const [productType, setProductType] = useState<ProductType>("Non-RTV");
  const [orderType, setOrderType] = useState("");
  const [marketplace, setMarketplace] = useState("");
  const [tab, setTab] = useState("executive");
  const [chartMode, setChartMode] = useState<UnitMode>("units");
  const [scoreMode, setScoreMode] = useState<UnitMode>("units");

  const [hasData, setHasData] = useState(false);
  const [options, setOptions] = useState({
    facilities: [] as string[],
    masterPrograms: [] as string[],
    orderTypes: [] as string[],
    marketplaces: [] as string[],
  });
  const [kpis, setKpis] = useState<ExecutiveKpis>(emptyKpis);
  const [points, setPoints] = useState<{ date: string; produced: number; sold: number }[]>([]);
  const [scorecard, setScorecard] = useState<ScorecardRow[]>([]);
  const [weeks, setWeeks] = useState<{ rows: NestedRow[]; totals: NestedRow | null }>({
    rows: [],
    totals: null,
  });
  const [categories, setCategories] = useState<{ rows: NestedRow[]; totals: NestedRow | null }>({
    rows: [],
    totals: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openFacilities, setOpenFacilities] = useState<Record<string, boolean>>({});

  const [job, setJob] = useState<JobStatus | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const listableRef = useRef<HTMLInputElement>(null);
  const soldRef = useRef<HTMLInputElement>(null);

  const filters: QueryFilters = useMemo(() => {
    const range = rangeFromPreset(preset, customFrom, customTo);
    return {
      from: range.from,
      to: range.to,
      facility,
      masterProgram,
      productType,
      orderType,
      marketplace,
    };
  }, [preset, customFrom, customTo, facility, masterProgram, productType, orderType, marketplace]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await api.status();
      setHasData(status.hasData);
      if (!status.hasData) {
        setKpis(emptyKpis);
        setPoints([]);
        setScorecard([]);
        setWeeks({ rows: [], totals: null });
        setCategories({ rows: [], totals: null });
        setOptions({ facilities: [], masterPrograms: [], orderTypes: [], marketplaces: [] });
        return;
      }
      const [opts, exec, chart, score, weekData, catData] = await Promise.all([
        api.filters(),
        api.executive(filters),
        api.chart(filters, chartMode),
        api.scorecard(filters, scoreMode),
        api.weeks(filters),
        api.categories(filters),
      ]);
      setOptions(opts);
      setKpis(exec);
      setPoints(chart.points);
      setScorecard(score.rows);
      setWeeks(weekData);
      setCategories(catData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [filters, chartMode, scoreMode]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!job || job.status === "completed" || job.status === "failed") return;
    const timer = window.setInterval(async () => {
      try {
        const next = await api.job(job.id);
        setJob(next);
        if (next.status === "completed") {
          await refreshAll();
        }
      } catch (err) {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: "failed",
                error: err instanceof Error ? err.message : "Lost contact with the upload job.",
              }
            : prev,
        );
      }
    }, 600);
    return () => window.clearInterval(timer);
  }, [job, refreshAll]);

  async function onFile(type: "listable" | "sold", file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const created = await api.upload(type, file);
      setJob(created);
    } catch (err) {
      setJob({
        id: "local",
        uploadType: type,
        filename: file.name,
        status: "failed",
        progress: 0,
        message: "Import rolled back. No rows from this file were saved.",
        error: err instanceof Error ? err.message : "Upload failed.",
        rowCount: null,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    }
  }

  async function openHistory() {
    setHistoryOpen(true);
    setHistory((await api.history()).history);
  }

  async function clearAll() {
    await api.clearAll();
    await refreshAll();
  }

  const dateLabel =
    preset === "yesterday"
      ? "Yesterday"
      : preset === "7d"
        ? "Last 7 Days"
        : preset === "30d"
          ? "Last 30 Days"
          : preset === "all"
            ? "All Time"
            : "Custom";

  return (
    <div className="min-h-svh">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                Sales operations
              </p>
              <h1 className="text-xl font-semibold text-slate-900">Listable vs Sales</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={listableRef}
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={(e) => {
                  void onFile("listable", e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <input
                ref={soldRef}
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={(e) => {
                  void onFile("sold", e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" onClick={() => listableRef.current?.click()}>
                <PackagePlus />
                Upload Stored to Listable
              </Button>
              <Button variant="outline" onClick={() => soldRef.current?.click()}>
                <ShoppingCart />
                Upload Sold
              </Button>
              <Button variant="outline" onClick={() => void openHistory()}>
                <History />
                Upload History
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Trash2 />
                    Clear All Data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogTitle className="text-base font-semibold text-slate-900">
                    Clear all imported data?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="mt-2 text-sm text-slate-600">
                    This removes every inventory row and the upload history. It cannot be undone.
                  </AlertDialogDescription>
                  <div className="mt-5 flex justify-end gap-2">
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void clearAll()}>Clear All Data</AlertDialogAction>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
            <label className="space-y-1 text-xs font-medium text-slate-500">
              Date range
              <NativeSelect
                value={preset}
                onChange={(e) => setPreset(e.target.value as DatePreset)}
              >
                <option value="yesterday">Yesterday</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="all">All Time</option>
                <option value="custom">Custom</option>
              </NativeSelect>
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-500">
              Facility
              <NativeSelect value={facility} onChange={(e) => setFacility(e.target.value)}>
                <option value="">All facilities</option>
                {options.facilities.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-500">
              Master program
              <NativeSelect value={masterProgram} onChange={(e) => setMasterProgram(e.target.value)}>
                <option value="">All master programs</option>
                {options.masterPrograms.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-500">
              Product type
              <NativeSelect
                value={productType}
                onChange={(e) => setProductType(e.target.value as ProductType)}
              >
                <option value="Non-RTV">Non-RTV</option>
                <option value="RTV">RTV</option>
                <option value="All">All</option>
              </NativeSelect>
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-500">
              Order type
              <NativeSelect value={orderType} onChange={(e) => setOrderType(e.target.value)}>
                <option value="">All order types</option>
                {options.orderTypes.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-500">
              Marketplace
              <NativeSelect value={marketplace} onChange={(e) => setMarketplace(e.target.value)}>
                <option value="">All marketplaces</option>
                {options.marketplaces.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
          {preset === "custom" ? (
            <div className="flex flex-wrap gap-2">
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6">
        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {!hasData ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="rounded-full bg-slate-100 p-3 text-slate-600">
                <Upload className="size-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">No inventory loaded</h2>
                <p className="mt-1 max-w-lg text-sm text-slate-600">
                  Upload the Stored to Listable file, then the Sold file. Parsing happens on the
                  server so 35–50 MB workbooks stay out of the browser. Imports commit in one
                  transaction — if anything fails, nothing is saved.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => listableRef.current?.click()}>
                  <PackagePlus />
                  Upload Stored to Listable
                </Button>
                <Button variant="outline" onClick={() => soldRef.current?.click()}>
                  <ShoppingCart />
                  Upload Sold
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={tab} onValueChange={setTab}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <TabsList>
                <TabsTrigger value="executive">Executive</TabsTrigger>
                <TabsTrigger value="data">Data - Units</TabsTrigger>
                <TabsTrigger value="category">Category - Units</TabsTrigger>
              </TabsList>
              <p className="text-xs text-slate-500">
                Showing {dateLabel}
                {filters.from && filters.to ? ` · ${filters.from} to ${filters.to} UTC` : ""}
                {loading ? " · Refreshing" : ""}
              </p>
            </div>

            <TabsContent value="executive" className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Kpi label="Listable Units" value={formatNumber(kpis.listableUnits)} />
                <Kpi label="Sold Units" value={formatNumber(kpis.soldUnits)} />
                <Kpi label="Sell-Through %" value={formatPct(kpis.sellThrough)} />
                <Kpi label="Listable Retail Value" value={formatMoney(kpis.listableRetailValue)} />
                <Kpi label="Total Sold GMV" value={formatMoney(kpis.soldGmv)} />
                <Kpi label="Recovery %" value={formatPct(kpis.recovery)} />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Listable vs Sales</CardTitle>
                  <Segmented value={chartMode} onChange={setChartMode} />
                </CardHeader>
                <CardContent>
                  <TrendChart points={points} mode={chartMode} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Facility Scorecard</CardTitle>
                  <Segmented value={scoreMode} onChange={setScoreMode} />
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-2 py-2 font-medium">Facility</th>
                          <th className="px-2 py-2 text-right font-medium">
                            {scoreMode === "pallets" ? "Listable Pallets" : "Listable Units"}
                          </th>
                          <th className="px-2 py-2 text-right font-medium">
                            {scoreMode === "pallets" ? "Sold Pallets" : "Sold Units"}
                          </th>
                          <th className="px-2 py-2 text-right font-medium">Sell-Through %</th>
                          <th className="px-2 py-2 text-right font-medium">Recovery %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scorecard.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-2 py-8 text-center text-slate-500">
                              No facilities in this range (WFS and MIAFL are omitted).
                            </td>
                          </tr>
                        ) : (
                          scorecard.map((row) => {
                            const expanded = Boolean(openFacilities[row.facility]);
                            const tone = sellThroughTone(row.sellThrough);
                            return (
                              <FacilityGroup
                                key={row.facility}
                                row={row}
                                expanded={expanded}
                                tone={tone}
                                onToggle={() =>
                                  setOpenFacilities((s) => ({
                                    ...s,
                                    [row.facility]: !expanded,
                                  }))
                                }
                              />
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="data">
              <Card>
                <CardHeader>
                  <CardTitle>Loose units by week</CardTitle>
                  <p className="text-xs text-slate-500">Mon–Sun weeks. RTV, pallet, $0, and excluded programs are always omitted.</p>
                </CardHeader>
                <CardContent>
                  <NestedTable
                    rows={weeks.rows}
                    totals={weeks.totals}
                    parentLabel="Week"
                    childLabel="Master program"
                    includeRecovery={false}
                    exportName="data-units"
                    loading={loading}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="category">
              <Card>
                <CardHeader>
                  <CardTitle>Loose units by category</CardTitle>
                  <p className="text-xs text-slate-500">
                    Expands into physical condition / condition. Recovery % is sold GMV ÷ put-away GMV.
                  </p>
                </CardHeader>
                <CardContent>
                  <NestedTable
                    rows={categories.rows}
                    totals={categories.totals}
                    parentLabel="Category"
                    childLabel="Classification"
                    includeRecovery
                    exportName="category-units"
                    loading={loading}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>

      <Dialog open={Boolean(job)} onOpenChange={(open) => !open && job && (job.status === "completed" || job.status === "failed") && setJob(null)}>
        <DialogContent>
          <DialogTitle>
            {job?.status === "failed"
              ? "Upload failed"
              : job?.status === "completed"
                ? "Upload complete"
                : "Uploading"}
          </DialogTitle>
          <DialogDescription>
            {job?.filename} · {job?.uploadType === "listable" ? "Stored to Listable" : "Sold"}
          </DialogDescription>
          <div className="mt-4 space-y-3">
            <Progress value={job?.status === "failed" ? 0 : job?.progress ?? 5} />
            <p className="text-sm text-slate-700">{job?.message}</p>
            {job?.error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {job.error}
              </p>
            ) : null}
            {job?.status === "completed" || job?.status === "failed" ? (
              <div className="flex justify-end">
                <Button onClick={() => setJob(null)}>Close</Button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Upload History</DialogTitle>
          <DialogDescription>Successful commits only. Failed imports are rolled back and never listed.</DialogDescription>
          <div className="mt-4 max-h-[360px] overflow-auto">
            {history.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No successful uploads yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2">File</th>
                    <th className="py-2">Type</th>
                    <th className="py-2 text-right">Rows</th>
                    <th className="py-2 text-right">Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="py-2">{row.filename}</td>
                      <td className="py-2 capitalize">{row.uploadType === "listable" ? "Stored to Listable" : "Sold"}</td>
                      <td className="py-2 text-right tabular-nums">{formatNumber(row.rowCount)}</td>
                      <td className="py-2 text-right text-slate-600">
                        {new Date(row.uploadedAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}

function FacilityGroup({
  row,
  expanded,
  tone,
  onToggle,
}: {
  row: ScorecardRow;
  expanded: boolean;
  tone: ReturnType<typeof sellThroughTone>;
  onToggle: () => void;
}) {
  const badgeTone = tone === "red" ? "red" : tone === "orange" ? "orange" : tone === "ok" ? "green" : "slate";
  return (
    <>
      <tr className="border-t border-slate-100">
        <td className="px-2 py-2">
          <button type="button" className="inline-flex items-center gap-2 font-medium" onClick={onToggle}>
            {expanded ? <ChevronDown className="size-4 text-slate-400" /> : <ChevronRight className="size-4 text-slate-400" />}
            {row.facility}
          </button>
        </td>
        <td className="px-2 py-2 text-right tabular-nums">{formatNumber(row.listable)}</td>
        <td className="px-2 py-2 text-right tabular-nums">{formatNumber(row.sold)}</td>
        <td className="px-2 py-2 text-right">
          <Badge tone={badgeTone}>{formatPct(row.sellThrough)}</Badge>
        </td>
        <td className="px-2 py-2 text-right tabular-nums">{formatPct(row.recovery)}</td>
      </tr>
      {expanded
        ? row.programs.map((program) => (
            <tr key={program.program} className="border-t border-slate-100 bg-slate-50/80 text-slate-700">
              <td className="px-2 py-2 pl-10">{program.program}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatNumber(program.listable)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatNumber(program.sold)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatPct(program.sellThrough)}</td>
              <td className="px-2 py-2 text-right tabular-nums">{formatPct(program.recovery)}</td>
            </tr>
          ))
        : null}
    </>
  );
}
