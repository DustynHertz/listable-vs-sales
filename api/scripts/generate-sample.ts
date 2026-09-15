import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const OUT = path.resolve(__dirname, "../../sample-data");

const MASTER_PROGRAMS = [
  "Walmart Computer Parts (Finished)",
  "Walmart Computers Parts (Finished)",
  "Walmart Finished Goods Wide Sku (Finished)",
  "Walmart Headphones & Speakers (Not Apple) (Finished)",
  "Walmart Monitors (Finished)",
  "Specialty",
  "Open Box Returns",
  "Warehouse Direct",
];

const CATEGORIES = ["Computers", "TVs", "Headphones", "Monitors", "Tablets", "Accessories"];
const PHYSICAL = ["Good", "Very Good", "Fair", "Damaged"];
const CONDITION = ["A", "B", "C"];
const MARKETPLACES = ["Walmart", "eBay", "Amazon", "Shopify"];
const ORDER_TYPES = ["Retail", "Wholesale", "Liquidation"];
const RTV_NON = ["Non RTV", "", "RTV Liquidate"];
const RTV_YES = ["RTV", "Research", "Return to Stock", "RTV Approved"];

function mulberry32(seed: number) {
  return function rand() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function csvEscape(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const rng = mulberry32(42);
  const today = "2026-09-15";
  const start = addDays(today, -40);

  const listableHeader = [
    "TRGID",
    "UPC",
    "Title",
    "ProgramName",
    "MasterProgramName",
    "CategoryName",
    "Manufacturer",
    "LocationNotListable",
    "ProductStatus",
    "MR_LMR_UPC_AverageCategoryRetail",
    "UPCRetail",
    "Classification_PHYSICAL CONDITION",
    "Classification_CONDITION",
    "Classification_TECHNICAL FUNCTIONALITY",
    "PalletLocationID",
    "RTVType",
    "Tag_NotListedReason",
    "Tag_VenueExclusivity",
    "Serialized",
    "FirstStoredOnListableLocationOn",
  ];

  const soldHeader = [
    "TRGID",
    "ProgramName",
    "MasterProgramName",
    "CategoryName",
    "Manufacturer",
    "Classification_PHYSICAL CONDITION",
    "Classification_CONDITION",
    "RTVType",
    "OrderNumber",
    "Sale Price (Discount applied)",
    "Retail Price On Sale Date",
    "MR_LMR_UPC_AverageCategoryRetail",
    "UPCRetail",
    "Order Type Sold On",
    "Marketplace Sold On",
    "OrderCustomerName",
    "OrderCustomerCompanyName",
    "MarketplacePONumber",
    "SortingIndex",
    "LocationID",
    "OrderCreatedDate",
  ];

  const programs = [
    "BRTON-WM-FOO",
    "BRTON-WM-BAR",
    "DALLX-HEADPHONES",
    "PHXAZ-RETURNS",
    "WFS-OVERFLOW",
    "MIAFL-HEAD-OFFICE",
    "MILON-WM-DOTCA-RTV",
    "BRTON-LENOVO-DC-400",
    "DS-MONTERREY",
  ];

  const listableRows: string[][] = [];
  const soldRows: string[][] = [];

  for (let i = 1; i <= 720; i++) {
    const trgid = `TRG${String(i).padStart(5, "0")}`;
    const program = i % 37 === 0 ? "BRTON-LENOVO-DC-400" : i % 41 === 0 ? "DS-MONTERREY" : pick(rng, programs.slice(0, 7));
    const master = pick(rng, MASTER_PROGRAMS);
    const category = pick(rng, CATEGORIES);
    const notListable = rng() < 0.06 ? "TRUE" : "FALSE";
    const pallet = rng() < 0.28 ? `PAL-${Math.floor(rng() * 80) + 1}` : "";
    const rtv = rng() < 0.12 ? pick(rng, RTV_YES) : pick(rng, RTV_NON);
    const mr = Math.round((40 + rng() * 220) * 100) / 100;
    const upc = Math.round((30 + rng() * 240) * 100) / 100;
    const stored = addDays(start, Math.floor(rng() * 41));
    const physical = pick(rng, PHYSICAL);
    const condition = pick(rng, CONDITION);

    listableRows.push([
      trgid,
      `00${100000000 + i}`,
      `Item ${i} ${category}`,
      program,
      master,
      category,
      pick(rng, ["Dell", "HP", "Samsung", "Sony", "Lenovo"]),
      notListable,
      "Active",
      `$${mr.toFixed(2)}`,
      `$${upc.toFixed(2)}`,
      physical,
      condition,
      "Functional",
      pallet,
      rtv,
      "",
      "",
      rng() < 0.2 ? "Y" : "N",
      stored,
    ]);

    if (i % 17 === 0) {
      listableRows.push([
        trgid,
        `00${100000000 + i}`,
        `Item ${i} duplicate last`,
        program,
        master,
        category,
        "Dell",
        notListable,
        "Active",
        `$${mr.toFixed(2)}`,
        `$${upc.toFixed(2)}`,
        physical,
        condition,
        "Functional",
        pallet,
        rtv,
        "",
        "",
        "N",
        stored,
      ]);
    }
  }

  listableRows.push([
    "",
    "000",
    "Blank TRGID",
    "BRTON-WM-FOO",
    "Specialty",
    "Computers",
    "Dell",
    "FALSE",
    "Active",
    "$10.00",
    "$10.00",
    "Good",
    "A",
    "Functional",
    "",
    "Non RTV",
    "",
    "",
    "N",
    addDays(today, -1),
  ]);

  for (let i = 1; i <= 720; i++) {
    if (rng() < 0.22) continue;
    const trgid = `TRG${String(i).padStart(5, "0")}`;
    const program = pick(rng, programs.slice(0, 7));
    const master = pick(rng, MASTER_PROGRAMS);
    const category = pick(rng, CATEGORIES);
    const rtv = rng() < 0.1 ? pick(rng, RTV_YES) : pick(rng, RTV_NON);
    const zeroSale = rng() < 0.08;
    const sale = zeroSale ? 0 : Math.round((12 + rng() * 180) * 100) / 100;
    const retail = Math.round((30 + rng() * 220) * 100) / 100;
    const mr = Math.round((40 + rng() * 220) * 100) / 100;
    const upc = Math.round((30 + rng() * 240) * 100) / 100;
    const pallet = rng() < 0.3;
    const recon = i % 53 === 0;
    const shamiss = i % 59 === 0;
    const hotRecovery = i % 61 === 0;
    soldRows.push([
      trgid,
      program,
      master,
      category,
      pick(rng, ["Dell", "HP", "Samsung"]),
      pick(rng, PHYSICAL),
      pick(rng, CONDITION),
      rtv,
      `ORD-${10000 + i}`,
      hotRecovery ? (retail * 1.8).toFixed(2) : sale.toFixed(2),
      retail.toFixed(2),
      mr.toFixed(2),
      upc.toFixed(2),
      pick(rng, ORDER_TYPES),
      pick(rng, MARKETPLACES),
      shamiss ? "Sender Shamiss" : pick(rng, ["Jordan Lee", "Alex Nguyen", "Sam Patel"]),
      recon ? "The Recon Group LLP" : "Acme Returns LLC",
      `PO-${i}`,
      pallet ? String(Math.floor(rng() * 12) + 1) : "",
      pallet ? `LOC-${Math.floor(rng() * 60) + 1}` : "",
      addDays(start, Math.floor(rng() * 41)),
    ]);
  }

  const listableCsv = [
    listableHeader.join(","),
    ...listableRows.map((r) => r.map(csvEscape).join(",")),
  ].join("\n");
  const soldCsv = [
    soldHeader.join(","),
    ...soldRows.map((r) => r.map(csvEscape).join(",")),
  ].join("\n");

  fs.writeFileSync(path.join(OUT, "stored-to-listable.csv"), listableCsv);
  fs.writeFileSync(path.join(OUT, "sold.csv"), soldCsv);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Listable");
  sheet.addRow(listableHeader);
  for (const row of listableRows.slice(0, 80)) sheet.addRow(row);
  await workbook.xlsx.writeFile(path.join(OUT, "stored-to-listable-sample.xlsx"));

  console.log(`Wrote sample files to ${OUT}`);
  console.log(`  stored-to-listable.csv  ${listableRows.length} data rows`);
  console.log(`  sold.csv                ${soldRows.length} data rows`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
