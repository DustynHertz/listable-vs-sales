import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import type { ChartPoint } from "@/lib/api";
import type { UnitMode } from "@/lib/format";
import { formatNumber } from "@/lib/format";

export function TrendChart({
  points,
  mode,
}: {
  points: ChartPoint[];
  mode: UnitMode;
}) {
  const data = points.map((p) => ({
    ...p,
    label: format(parseISO(p.date), points.length > 20 ? "MMM d" : "MMM d"),
  }));

  return (
    <div className="h-[280px] w-full">
      {data.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          No produced or sold activity in this range.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart key={mode} data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="producedFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7eafd4" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#7eafd4" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e8edf2" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              width={48}
            />
            <Tooltip
              formatter={(value, name) => [
                formatNumber(Number(value)),
                name === "produced" ? "Produced" : "Sold",
              ]}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 12,
              }}
            />
            <Legend
              formatter={(value) => (value === "produced" ? `Produced (${mode})` : `Sold (${mode})`)}
            />
            <Area
              type="monotone"
              dataKey="produced"
              stroke="#6b9bc3"
              fill="url(#producedFill)"
              strokeWidth={2}
              name="produced"
            />
            <Line
              type="monotone"
              dataKey="sold"
              stroke="#2f8f5b"
              strokeDasharray="6 4"
              strokeWidth={2}
              dot={{ r: 3, fill: "#2f8f5b" }}
              name="sold"
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
