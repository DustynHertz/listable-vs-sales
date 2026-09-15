import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import type { NestedRow } from "@/lib/api";
import { downloadCsv, formatMoney, formatNumber, formatPct, toCsv } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SortKey = "label" | "putawayQty" | "putawayGmv" | "soldQty" | "soldGmv" | "sellThrough" | "recovery";

export function NestedTable({
  rows,
  totals,
  parentLabel,
  childLabel,
  includeRecovery,
  exportName,
  loading,
}: {
  rows: NestedRow[];
  totals: NestedRow | null;
  parentLabel: string;
  childLabel: string;
  includeRecovery: boolean;
  exportName: string;
  loading: boolean;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sortKey, setSortKey] = useState<SortKey>("label");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => compare(a, b, sortKey, sortDir));
    return copy;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "label" ? "asc" : "desc");
    }
  }

  function exportCsv() {
    const headers = [
      parentLabel,
      childLabel,
      "Put-Away Qty",
      "Put-Away GMV",
      "Sold Qty",
      "Sold GMV",
      "Sell-Through %",
      ...(includeRecovery ? ["Recovery %"] : []),
    ];
    const data: Array<Array<string | number>> = [];
    for (const row of sorted) {
      data.push(flat(row, row.label, ""));
      for (const child of row.children) data.push(flat(child, row.label, child.label));
    }
    if (totals) data.push(flat(totals, "Total", ""));
    downloadCsv(`${exportName}.csv`, toCsv(headers, data));
  }

  function flat(
    row: Pick<NestedRow, "putawayQty" | "putawayGmv" | "soldQty" | "soldGmv" | "sellThrough" | "recovery">,
    group: string,
    child: string,
  ) {
    const cells: Array<string | number> = [
      group,
      child,
      row.putawayQty,
      Math.round(row.putawayGmv),
      row.soldQty,
      Math.round(row.soldGmv),
      row.sellThrough === null ? "—" : `${(row.sellThrough * 100).toFixed(1)}%`,
    ];
    if (includeRecovery) {
      cells.push(row.recovery === null || row.recovery === undefined ? "—" : `${(row.recovery * 100).toFixed(1)}%`);
    }
    return cells;
  }

  const Head = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <th className={cn("px-3 py-2 font-medium", className)}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-slate-900" onClick={() => toggleSort(k)}>
        {label}
        {sortKey === k ? <span className="text-[10px]">{sortDir === "asc" ? "▲" : "▼"}</span> : null}
      </button>
    </th>
  );

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
          <Download />
          Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <Head k="label" label={parentLabel} className="text-left" />
              <Head k="putawayQty" label="Put-Away Qty" className="text-right" />
              <Head k="putawayGmv" label="Put-Away GMV" className="text-right" />
              <Head k="soldQty" label="Sold Qty" className="text-right" />
              <Head k="soldGmv" label="Sold GMV" className="text-right" />
              <Head k="sellThrough" label="Sell-Through %" className="text-right" />
              {includeRecovery ? <Head k="recovery" label="Recovery %" className="text-right" /> : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={includeRecovery ? 7 : 6} className="px-3 py-10 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={includeRecovery ? 7 : 6} className="px-3 py-10 text-center text-slate-500">
                  No loose-unit rows in this range after hard exclusions.
                </td>
              </tr>
            ) : (
              sorted.map((row) => {
                const expanded = Boolean(open[row.key]);
                return (
                  <RowGroup
                    key={row.key}
                    row={row}
                    expanded={expanded}
                    includeRecovery={includeRecovery}
                    onToggle={() => setOpen((s) => ({ ...s, [row.key]: !expanded }))}
                  />
                );
              })
            )}
          </tbody>
          {totals && !loading ? (
            <tfoot className="bg-slate-50 font-semibold">
              <MetricRow row={totals} includeRecovery={includeRecovery} indent={false} strong />
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

function compare(a: NestedRow, b: NestedRow, key: SortKey, dir: "asc" | "desc") {
  const av = key === "label" ? a.key : (a[key] ?? -1);
  const bv = key === "label" ? b.key : (b[key] ?? -1);
  const cmp = av < bv ? -1 : av > bv ? 1 : 0;
  return dir === "asc" ? cmp : -cmp;
}

function RowGroup({
  row,
  expanded,
  includeRecovery,
  onToggle,
}: {
  row: NestedRow;
  expanded: boolean;
  includeRecovery: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50">
        <td className="px-3 py-2">
          <button type="button" className="inline-flex items-center gap-2 text-left font-medium" onClick={onToggle}>
            {expanded ? <ChevronDown className="size-4 text-slate-400" /> : <ChevronRight className="size-4 text-slate-400" />}
            {row.label}
          </button>
        </td>
        <Cells row={row} includeRecovery={includeRecovery} />
      </tr>
      {expanded
        ? row.children.map((child) => (
            <tr key={child.key} className="border-t border-slate-100 bg-slate-50/70 text-slate-700">
              <td className="px-3 py-2 pl-10">{child.label}</td>
              <Cells row={child} includeRecovery={includeRecovery} />
            </tr>
          ))
        : null}
    </>
  );
}

function MetricRow({
  row,
  includeRecovery,
  indent,
  strong,
}: {
  row: NestedRow;
  includeRecovery: boolean;
  indent: boolean;
  strong?: boolean;
}) {
  return (
    <tr className={strong ? "border-t border-slate-200" : ""}>
      <td className={cn("px-3 py-2", indent && "pl-10")}>{row.label}</td>
      <Cells row={row} includeRecovery={includeRecovery} />
    </tr>
  );
}

function Cells({
  row,
  includeRecovery,
}: {
  row: Pick<NestedRow, "putawayQty" | "putawayGmv" | "soldQty" | "soldGmv" | "sellThrough" | "recovery">;
  includeRecovery: boolean;
}) {
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.putawayQty)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.putawayGmv)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.soldQty)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.soldGmv)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatPct(row.sellThrough)}</td>
      {includeRecovery ? (
        <td className="px-3 py-2 text-right tabular-nums">{formatPct(row.recovery ?? null)}</td>
      ) : null}
    </>
  );
}
