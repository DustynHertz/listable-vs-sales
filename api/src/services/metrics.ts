import type { QueryFilters, UnitMode } from "../types";
import { pool } from "../db/pool";

function productTypeSql(column: string, productType: QueryFilters["productType"]): string {
  if (productType === "All") return "TRUE";
  if (productType === "RTV") return `is_rtv(${column})`;
  return `is_non_rtv(${column})`;
}

const LOOSE_PUTAWAY = `(i.pallet_location_id IS NULL OR btrim(i.pallet_location_id) = '')`;
const LOOSE_SOLD = `(i.sorting_index IS NULL OR btrim(i.sorting_index) = '')`;
const PALLET_PUTAWAY = `(i.pallet_location_id IS NOT NULL AND btrim(i.pallet_location_id) <> '')`;
const PALLET_SOLD_BASE = `(i.sorting_index IS NOT NULL AND btrim(i.sorting_index) <> '' AND i.location_id IS NOT NULL AND btrim(i.location_id) <> '')`;
const PALLET_SOLD_EXCL = `
  ${PALLET_SOLD_BASE}
  AND NOT is_rtv(i.rtv_type_sold)
  AND COALESCE(i.order_customer_company_name, '') <> 'The Recon Group LLP'
  AND COALESCE(i.order_customer_name, '') <> 'Sender Shamiss'
`;
const DATA_TAB_PROGRAMS = `
  lower(COALESCE(%COL%, '')) NOT IN ('ds-monterrey', 'ds-mercorp', 'miafl-head-office')
`;

function putawayWhere(f: QueryFilters, extra: string[] = []): { sql: string; params: unknown[] } {
  const params: unknown[] = [f.from, f.to, f.facility, f.masterProgram];
  const parts = [
    "i.has_putaway",
    "i.location_not_listable IS FALSE",
    "($1::date IS NULL OR i.first_stored_on_listable_location_on >= $1::date)",
    "($2::date IS NULL OR i.first_stored_on_listable_location_on <= $2::date)",
    "($3::text IS NULL OR i.facility = $3)",
    "($4::text IS NULL OR display_master(i.master_program_name) = $4)",
    productTypeSql("i.rtv_type", f.productType),
    ...extra,
  ];
  return { sql: parts.join("\n      AND "), params };
}

function soldWhere(f: QueryFilters, extra: string[] = []): { sql: string; params: unknown[] } {
  const params: unknown[] = [
    f.from,
    f.to,
    f.facility,
    f.masterProgram,
    f.orderType,
    f.marketplace,
  ];
  const parts = [
    "i.sale_price IS NOT NULL AND i.sale_price > 0",
    "($1::date IS NULL OR i.order_created_date >= $1::date)",
    "($2::date IS NULL OR i.order_created_date <= $2::date)",
    "($3::text IS NULL OR i.facility_sold = $3)",
    "($4::text IS NULL OR display_master(i.master_program_name_sold) = $4)",
    productTypeSql("i.rtv_type_sold", f.productType),
    "($5::text IS NULL OR i.order_type_sold_on = $5)",
    "($6::text IS NULL OR i.marketplace_sold_on = $6)",
    ...extra,
  ];
  return { sql: parts.join("\n      AND "), params };
}

function dataPutawayWhere(f: QueryFilters): { sql: string; params: unknown[] } {
  return putawayWhere(f, [
    LOOSE_PUTAWAY,
    "NOT is_rtv(i.rtv_type)",
    DATA_TAB_PROGRAMS.replace("%COL%", "i.program_name"),
  ]);
}

function dataSoldWhere(f: QueryFilters): { sql: string; params: unknown[] } {
  return soldWhere(f, [
    LOOSE_SOLD,
    "NOT is_rtv(i.rtv_type_sold)",
    DATA_TAB_PROGRAMS.replace("%COL%", "i.program_name_sold"),
  ]);
}

export async function hasData(): Promise<{ hasData: boolean; lastUploadAt: string | null }> {
  const [countRes, histRes] = await Promise.all([
    pool.query(`SELECT EXISTS (SELECT 1 FROM inventory_items) AS present`),
    pool.query(`SELECT MAX(uploaded_at) AS last FROM upload_history`),
  ]);
  return {
    hasData: Boolean(countRes.rows[0]?.present),
    lastUploadAt: histRes.rows[0]?.last
      ? new Date(histRes.rows[0].last).toISOString()
      : null,
  };
}

export async function filterOptions(): Promise<{
  facilities: string[];
  masterPrograms: string[];
  orderTypes: string[];
  marketplaces: string[];
}> {
  const result = await pool.query(`
    SELECT
      ARRAY(
        SELECT DISTINCT v FROM (
          SELECT facility AS v FROM inventory_items WHERE facility IS NOT NULL AND facility <> ''
          UNION
          SELECT facility_sold FROM inventory_items WHERE facility_sold IS NOT NULL AND facility_sold <> ''
        ) s ORDER BY 1
      ) AS facilities,
      ARRAY(
        SELECT DISTINCT v FROM (
          SELECT display_master(master_program_name) AS v FROM inventory_items
          WHERE master_program_name IS NOT NULL AND master_program_name <> ''
          UNION
          SELECT display_master(master_program_name_sold) FROM inventory_items
          WHERE master_program_name_sold IS NOT NULL AND master_program_name_sold <> ''
        ) s WHERE v IS NOT NULL ORDER BY 1
      ) AS master_programs,
      ARRAY(
        SELECT DISTINCT order_type_sold_on FROM inventory_items
        WHERE order_type_sold_on IS NOT NULL AND order_type_sold_on <> ''
        ORDER BY 1
      ) AS order_types,
      ARRAY(
        SELECT DISTINCT marketplace_sold_on FROM inventory_items
        WHERE marketplace_sold_on IS NOT NULL AND marketplace_sold_on <> ''
        ORDER BY 1
      ) AS marketplaces
  `);
  const row = result.rows[0] ?? {};
  return {
    facilities: row.facilities ?? [],
    masterPrograms: row.master_programs ?? [],
    orderTypes: row.order_types ?? [],
    marketplaces: row.marketplaces ?? [],
  };
}

function ratio(num: number, den: number): number | null {
  if (den === 0) return null;
  return num / den;
}

export async function executiveKpis(f: QueryFilters) {
  const put = putawayWhere(f);
  const sold = soldWhere(f);
  const [putRes, soldRes] = await Promise.all([
    pool.query(
      `
      SELECT
        COUNT(*)::int AS units,
        COALESCE(SUM(listable_retail(i.mr_lmr_upc_average_category_retail, i.upc_retail)), 0)::float AS gmv
      FROM inventory_items i
      WHERE ${put.sql}
      `,
      put.params,
    ),
    pool.query(
      `
      SELECT
        COUNT(*)::int AS units,
        COALESCE(SUM(i.sale_price), 0)::float AS gmv
      FROM inventory_items i
      WHERE ${sold.sql}
      `,
      sold.params,
    ),
  ]);

  const listableUnits = Number(putRes.rows[0]?.units ?? 0);
  const soldUnits = Number(soldRes.rows[0]?.units ?? 0);
  const listableRetailValue = Number(putRes.rows[0]?.gmv ?? 0);
  const soldGmv = Number(soldRes.rows[0]?.gmv ?? 0);

  return {
    listableUnits,
    soldUnits,
    sellThrough: ratio(soldUnits, listableUnits),
    listableRetailValue,
    soldGmv,
    recovery: ratio(soldGmv, listableRetailValue),
  };
}

export async function chartSeries(f: QueryFilters, mode: UnitMode) {
  let from = f.from;
  let to = f.to;
  if (!from || !to) {
    const bounds = await pool.query(`
      SELECT MIN(d) AS min_d, MAX(d) AS max_d FROM (
        SELECT first_stored_on_listable_location_on AS d FROM inventory_items WHERE has_putaway
        UNION ALL
        SELECT order_created_date FROM inventory_items WHERE sale_price > 0
      ) s
    `);
    from = from ?? (bounds.rows[0]?.min_d ? new Date(bounds.rows[0].min_d).toISOString().slice(0, 10) : null);
    to = to ?? (bounds.rows[0]?.max_d ? new Date(bounds.rows[0].max_d).toISOString().slice(0, 10) : null);
  }
  if (!from || !to) return { points: [] as Array<{ date: string; produced: number; sold: number }> };

  const put = putawayWhere({ ...f, from, to });
  const sold = soldWhere(
    { ...f, from, to },
    mode === "pallets" ? [PALLET_SOLD_EXCL] : [],
  );

  const producedExpr =
    mode === "pallets"
      ? `COUNT(DISTINCT CASE WHEN ${PALLET_PUTAWAY} THEN i.pallet_location_id END)::int`
      : `COUNT(*)::int`;
  const soldExpr =
    mode === "pallets"
      ? `COUNT(DISTINCT i.location_id)::int`
      : `COUNT(*)::int`;

  const [produced, soldRows] = await Promise.all([
    pool.query(
      `
      SELECT i.first_stored_on_listable_location_on AS d, ${producedExpr} AS n
      FROM inventory_items i
      WHERE ${put.sql}
      GROUP BY 1
      `,
      put.params,
    ),
    pool.query(
      `
      SELECT i.order_created_date AS d, ${soldExpr} AS n
      FROM inventory_items i
      WHERE ${sold.sql}
      GROUP BY 1
      `,
      sold.params,
    ),
  ]);

  const producedMap = new Map<string, number>();
  for (const row of produced.rows) {
    producedMap.set(isoDate(row.d), Number(row.n));
  }
  const soldMap = new Map<string, number>();
  for (const row of soldRows.rows) {
    soldMap.set(isoDate(row.d), Number(row.n));
  }

  const points: Array<{ date: string; produced: number; sold: number }> = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    points.push({
      date,
      produced: producedMap.get(date) ?? 0,
      sold: soldMap.get(date) ?? 0,
    });
  }
  return { points };
}

function isoDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

async function unitRecoveryBy(
  f: QueryFilters,
  groupExpr: string,
): Promise<Map<string, number | null>> {
  const sold = soldWhere(f, [LOOSE_SOLD]);
  const result = await pool.query(
    `
    SELECT ${groupExpr} AS k,
      AVG(i.sale_price / NULLIF(sold_retail_basis(
        i.retail_price_on_sale_date,
        i.mr_lmr_upc_average_category_retail_sold,
        i.upc_retail_sold
      ), 0))::float AS rec
    FROM inventory_items i
    WHERE ${sold.sql}
      AND sold_retail_basis(
        i.retail_price_on_sale_date,
        i.mr_lmr_upc_average_category_retail_sold,
        i.upc_retail_sold
      ) > 0
    GROUP BY 1
    `,
    sold.params,
  );
  const map = new Map<string, number | null>();
  for (const row of result.rows) {
    map.set(String(row.k ?? ""), row.rec === null ? null : Number(row.rec));
  }
  return map;
}

async function palletRecoveryBy(
  f: QueryFilters,
  groupExpr: string,
): Promise<Map<string, number | null>> {
  const sold = soldWhere(f, [PALLET_SOLD_EXCL]);
  const result = await pool.query(
    `
    WITH pallet_rates AS (
      SELECT ${groupExpr} AS k,
        i.location_id,
        SUM(i.sale_price) / NULLIF(SUM(sold_retail_basis(
          i.retail_price_on_sale_date,
          i.mr_lmr_upc_average_category_retail_sold,
          i.upc_retail_sold
        )), 0) AS rec
      FROM inventory_items i
      WHERE ${sold.sql}
      GROUP BY 1, 2
    )
    SELECT k,
      AVG(rec) FILTER (WHERE rec IS NOT NULL AND rec <= 1.5)::float AS rec
    FROM pallet_rates
    GROUP BY k
    `,
    sold.params,
  );
  const map = new Map<string, number | null>();
  for (const row of result.rows) {
    map.set(String(row.k ?? ""), row.rec === null ? null : Number(row.rec));
  }
  return map;
}

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

export async function facilityScorecard(f: QueryFilters, mode: UnitMode): Promise<{ rows: ScorecardRow[] }> {
  const putExtra = mode === "pallets" ? [PALLET_PUTAWAY] : [];
  const soldExtra = mode === "pallets" ? [PALLET_SOLD_EXCL] : [];
  const put = putawayWhere(f, putExtra);
  const sold = soldWhere(f, soldExtra);

  const listableExpr =
    mode === "pallets"
      ? `COUNT(DISTINCT i.pallet_location_id)::int`
      : `COUNT(*)::int`;
  const soldExpr =
    mode === "pallets" ? `COUNT(DISTINCT i.location_id)::int` : `COUNT(*)::int`;

  const [putFac, soldFac, putProg, soldProg] = await Promise.all([
    pool.query(
      `
      SELECT i.facility AS k, ${listableExpr} AS n
      FROM inventory_items i
      WHERE ${put.sql}
        AND i.facility IS NOT NULL AND i.facility NOT IN ('WFS', 'MIAFL')
      GROUP BY 1
      `,
      put.params,
    ),
    pool.query(
      `
      SELECT i.facility_sold AS k, ${soldExpr} AS n
      FROM inventory_items i
      WHERE ${sold.sql}
        AND i.facility_sold IS NOT NULL AND i.facility_sold NOT IN ('WFS', 'MIAFL')
      GROUP BY 1
      `,
      sold.params,
    ),
    pool.query(
      `
      SELECT i.facility AS fac, COALESCE(i.program_name, '(blank)') AS prog, ${listableExpr} AS n
      FROM inventory_items i
      WHERE ${put.sql}
        AND i.facility IS NOT NULL AND i.facility NOT IN ('WFS', 'MIAFL')
      GROUP BY 1, 2
      `,
      put.params,
    ),
    pool.query(
      `
      SELECT i.facility_sold AS fac, COALESCE(i.program_name_sold, '(blank)') AS prog, ${soldExpr} AS n
      FROM inventory_items i
      WHERE ${sold.sql}
        AND i.facility_sold IS NOT NULL AND i.facility_sold NOT IN ('WFS', 'MIAFL')
      GROUP BY 1, 2
      `,
      sold.params,
    ),
  ]);

  const recMap =
    mode === "pallets"
      ? await palletRecoveryBy(f, "i.facility_sold")
      : await unitRecoveryBy(f, "i.facility_sold");
  const recProgMap =
    mode === "pallets"
      ? await palletRecoveryBy(f, "i.facility_sold || E'\\t' || COALESCE(i.program_name_sold, '(blank)')")
      : await unitRecoveryBy(f, "i.facility_sold || E'\\t' || COALESCE(i.program_name_sold, '(blank)')");

  const facilities = new Set<string>();
  const listableByFac = new Map<string, number>();
  const soldByFac = new Map<string, number>();
  for (const row of putFac.rows) {
    facilities.add(String(row.k));
    listableByFac.set(String(row.k), Number(row.n));
  }
  for (const row of soldFac.rows) {
    facilities.add(String(row.k));
    soldByFac.set(String(row.k), Number(row.n));
  }

  const programsByFac = new Map<string, Map<string, { listable: number; sold: number }>>();
  const ensureProg = (fac: string, prog: string) => {
    if (!programsByFac.has(fac)) programsByFac.set(fac, new Map());
    const inner = programsByFac.get(fac)!;
    if (!inner.has(prog)) inner.set(prog, { listable: 0, sold: 0 });
    return inner.get(prog)!;
  };
  for (const row of putProg.rows) {
    ensureProg(String(row.fac), String(row.prog)).listable = Number(row.n);
  }
  for (const row of soldProg.rows) {
    ensureProg(String(row.fac), String(row.prog)).sold = Number(row.n);
  }

  const rows: ScorecardRow[] = [...facilities].map((facility) => {
    const listable = listableByFac.get(facility) ?? 0;
    const soldN = soldByFac.get(facility) ?? 0;
    const programs = [...(programsByFac.get(facility)?.entries() ?? [])]
      .map(([program, vals]) => ({
        program,
        listable: vals.listable,
        sold: vals.sold,
        sellThrough: ratio(vals.sold, vals.listable),
        recovery: recProgMap.get(`${facility}\t${program}`) ?? null,
      }))
      .sort((a, b) => {
        const av = a.sellThrough ?? Number.POSITIVE_INFINITY;
        const bv = b.sellThrough ?? Number.POSITIVE_INFINITY;
        return av - bv;
      });
    return {
      facility,
      listable,
      sold: soldN,
      sellThrough: ratio(soldN, listable),
      recovery: recMap.get(facility) ?? null,
      programs,
    };
  });

  rows.sort((a, b) => {
    const av = a.sellThrough ?? Number.POSITIVE_INFINITY;
    const bv = b.sellThrough ?? Number.POSITIVE_INFINITY;
    return av - bv;
  });

  return { rows };
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function weekLabel(weekStartIso: string): string {
  const start = new Date(`${weekStartIso}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const startMonth = MONTHS[start.getUTCMonth()];
  const endMonth = MONTHS[end.getUTCMonth()];
  const year = end.getUTCFullYear();
  if (startMonth === endMonth) {
    return `${startMonth} ${start.getUTCDate()} - ${end.getUTCDate()}, ${year}`;
  }
  return `${startMonth} ${start.getUTCDate()} - ${endMonth} ${end.getUTCDate()}, ${year}`;
}

export type NestedMetricRow = {
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

function mergeNested(
  putRows: Array<Record<string, unknown>>,
  soldRows: Array<Record<string, unknown>>,
  parentKey: (row: Record<string, unknown>) => string,
  parentLabel: (key: string) => string,
  childKey: (row: Record<string, unknown>) => string,
  includeRecovery: boolean,
): { rows: NestedMetricRow[]; totals: NestedMetricRow } {
  type Agg = { putawayQty: number; putawayGmv: number; soldQty: number; soldGmv: number };
  const parents = new Map<string, Agg>();
  const children = new Map<string, Map<string, Agg>>();

  const bump = (map: Map<string, Agg>, key: string, side: "put" | "sold", qty: number, gmv: number) => {
    if (!map.has(key)) map.set(key, { putawayQty: 0, putawayGmv: 0, soldQty: 0, soldGmv: 0 });
    const agg = map.get(key)!;
    if (side === "put") {
      agg.putawayQty += qty;
      agg.putawayGmv += gmv;
    } else {
      agg.soldQty += qty;
      agg.soldGmv += gmv;
    }
  };

  for (const row of putRows) {
    const pk = parentKey(row);
    const ck = childKey(row);
    bump(parents, pk, "put", Number(row.qty), Number(row.gmv));
    if (!children.has(pk)) children.set(pk, new Map());
    bump(children.get(pk)!, ck, "put", Number(row.qty), Number(row.gmv));
  }
  for (const row of soldRows) {
    const pk = parentKey(row);
    const ck = childKey(row);
    bump(parents, pk, "sold", Number(row.qty), Number(row.gmv));
    if (!children.has(pk)) children.set(pk, new Map());
    bump(children.get(pk)!, ck, "sold", Number(row.qty), Number(row.gmv));
  }

  const toRow = (key: string, label: string, agg: Agg, childList: NestedMetricRow["children"]): NestedMetricRow => {
    const row: NestedMetricRow = {
      key,
      label,
      putawayQty: agg.putawayQty,
      putawayGmv: agg.putawayGmv,
      soldQty: agg.soldQty,
      soldGmv: agg.soldGmv,
      sellThrough: ratio(agg.soldQty, agg.putawayQty),
      children: childList,
    };
    if (includeRecovery) row.recovery = ratio(agg.soldGmv, agg.putawayGmv);
    return row;
  };

  const rows = [...parents.entries()]
    .map(([key, agg]) => {
      const childList = [...(children.get(key)?.entries() ?? [])]
        .map(([ck, cagg]) => {
          const child: NestedMetricRow["children"][number] = {
            key: `${key}::${ck}`,
            label: ck,
            putawayQty: cagg.putawayQty,
            putawayGmv: cagg.putawayGmv,
            soldQty: cagg.soldQty,
            soldGmv: cagg.soldGmv,
            sellThrough: ratio(cagg.soldQty, cagg.putawayQty),
          };
          if (includeRecovery) child.recovery = ratio(cagg.soldGmv, cagg.putawayGmv);
          return child;
        })
        .sort((a, b) => a.label.localeCompare(b.label));
      return toRow(key, parentLabel(key), agg, childList);
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  const totalsAgg: Agg = { putawayQty: 0, putawayGmv: 0, soldQty: 0, soldGmv: 0 };
  for (const r of rows) {
    totalsAgg.putawayQty += r.putawayQty;
    totalsAgg.putawayGmv += r.putawayGmv;
    totalsAgg.soldQty += r.soldQty;
    totalsAgg.soldGmv += r.soldGmv;
  }
  const totals = toRow("totals", "Total", totalsAgg, []);
  return { rows, totals };
}

export async function weeklyUnits(f: QueryFilters) {
  const put = dataPutawayWhere(f);
  const sold = dataSoldWhere(f);
  const [putRows, soldRows] = await Promise.all([
    pool.query(
      `
      SELECT
        date_trunc('week', i.first_stored_on_listable_location_on)::date AS week_start,
        COALESCE(display_master(i.master_program_name), '(Unspecified)') AS child,
        COUNT(*)::int AS qty,
        COALESCE(SUM(listable_retail(i.mr_lmr_upc_average_category_retail, i.upc_retail)), 0)::float AS gmv
      FROM inventory_items i
      WHERE ${put.sql}
      GROUP BY 1, 2
      `,
      put.params,
    ),
    pool.query(
      `
      SELECT
        date_trunc('week', i.order_created_date)::date AS week_start,
        COALESCE(display_master(i.master_program_name_sold), '(Unspecified)') AS child,
        COUNT(*)::int AS qty,
        COALESCE(SUM(i.sale_price), 0)::float AS gmv
      FROM inventory_items i
      WHERE ${sold.sql}
      GROUP BY 1, 2
      `,
      sold.params,
    ),
  ]);

  return mergeNested(
    putRows.rows,
    soldRows.rows,
    (row) => isoDate(row.week_start),
    (key) => weekLabel(key),
    (row) => String(row.child),
    false,
  );
}

export async function categoryUnits(f: QueryFilters) {
  const put = dataPutawayWhere(f);
  const sold = dataSoldWhere(f);
  const classExpr = (prefix: "put" | "sold") => {
    const phys =
      prefix === "put"
        ? "i.classification_physical_condition"
        : "i.classification_physical_condition_sold";
    const cond =
      prefix === "put" ? "i.classification_condition" : "i.classification_condition_sold";
    return `NULLIF(btrim(COALESCE(${phys}, '') || CASE WHEN COALESCE(${phys}, '') <> '' AND COALESCE(${cond}, '') <> '' THEN ' / ' ELSE '' END || COALESCE(${cond}, '')), '')`;
  };

  const [putRows, soldRows] = await Promise.all([
    pool.query(
      `
      SELECT
        COALESCE(NULLIF(btrim(i.category_name), ''), '(Uncategorized)') AS category,
        COALESCE(${classExpr("put")}, '(Unspecified)') AS child,
        COUNT(*)::int AS qty,
        COALESCE(SUM(listable_retail(i.mr_lmr_upc_average_category_retail, i.upc_retail)), 0)::float AS gmv
      FROM inventory_items i
      WHERE ${put.sql}
      GROUP BY 1, 2
      `,
      put.params,
    ),
    pool.query(
      `
      SELECT
        COALESCE(NULLIF(btrim(i.category_name_sold), ''), '(Uncategorized)') AS category,
        COALESCE(${classExpr("sold")}, '(Unspecified)') AS child,
        COUNT(*)::int AS qty,
        COALESCE(SUM(i.sale_price), 0)::float AS gmv
      FROM inventory_items i
      WHERE ${sold.sql}
      GROUP BY 1, 2
      `,
      sold.params,
    ),
  ]);

  return mergeNested(
    putRows.rows,
    soldRows.rows,
    (row) => String(row.category),
    (key) => key,
    (row) => String(row.child),
    true,
  );
}
