import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../src/db/migrate";
import { pool } from "../src/db/pool";
import { processUpload, createJob } from "../src/services/upload";
import {
  categoryUnits,
  executiveKpis,
  facilityScorecard,
  weeklyUnits,
} from "../src/services/metrics";
import type { QueryFilters } from "../src/types";

const yesterday = "2026-09-14";
const filters: QueryFilters = {
  from: yesterday,
  to: yesterday,
  facility: null,
  masterProgram: null,
  productType: "Non-RTV",
  orderType: null,
  marketplace: null,
};

function writeCsv(name: string, header: string, rows: string[]): string {
  const filePath = path.join(os.tmpdir(), name);
  fs.writeFileSync(filePath, [header, ...rows].join("\n"));
  return filePath;
}

async function upload(type: "listable" | "sold", filePath: string, filename: string) {
  const id = crypto.randomUUID();
  await createJob(id, type, filename);
  await processUpload(id, type, filename, filePath);
  const job = await pool.query(`SELECT * FROM upload_jobs WHERE id = $1`, [id]);
  return job.rows[0];
}

beforeAll(async () => {
  await migrate();
});

beforeEach(async () => {
  await pool.query("TRUNCATE inventory_items");
  await pool.query("TRUNCATE upload_history RESTART IDENTITY");
  await pool.query("TRUNCATE upload_jobs");
});

afterAll(async () => {
  await pool.query("TRUNCATE inventory_items");
  await pool.query("TRUNCATE upload_history RESTART IDENTITY");
  await pool.query("TRUNCATE upload_jobs");
  await pool.end();
});

describe("atomic uploads", () => {
  it("keeps the last duplicate TRGID, drops exclusions, and rewrites programs", async () => {
    const listable = writeCsv(
      "listable-fixture.csv",
      "TRGID,Title,ProgramName,MasterProgramName,CategoryName,LocationNotListable,PalletLocationID,RTVType,MR_LMR_UPC_AverageCategoryRetail,UPCRetail,Classification_PHYSICAL CONDITION,Classification_CONDITION,FirstStoredOnListableLocationOn",
      [
        "L001,First,BRTON-WM-FOO,Walmart Computer Parts (Finished),Computers,FALSE,,Non RTV,$100.00,$80.00,Good,A,2026-09-14",
        "L001,Last wins,BRTON-WM-FOO,Walmart Computer Parts (Finished),Computers,FALSE,,Non RTV,$100.00,$80.00,Good,A,2026-09-14",
        ",Blank TRGID,BRTON-WM-FOO,Other,Computers,FALSE,,Non RTV,10,10,Good,A,2026-09-14",
        "DROP1,x,BRTON-LENOVO-DC-400,Other,Computers,FALSE,,Non RTV,10,10,Good,A,2026-09-14",
        "DROP2,x,DS-MONTERREY,Other,Computers,FALSE,,Non RTV,10,10,Good,A,2026-09-14",
        "LREW,Rewritten,MILON-WM-DOTCA-RTV,Other Master,TVs,FALSE,,Non RTV,40,40,Good,A,2026-09-14",
        "L002,Pallet,BRTON-WM-BAR,Other Master,TVs,FALSE,PAL-1,Non RTV,50,60,Fair,B,2026-09-14",
        "L003,Not listable,BRTON-WM-FOO,Other Master,Computers,TRUE,,Non RTV,10,10,Good,A,2026-09-14",
        "L004,RTV unit,BRTON-WM-FOO,Other Master,Computers,FALSE,,RTV,10,10,Good,A,2026-09-14",
        "L005,WFS row,WFS-SOMETHING,Other Master,Computers,FALSE,,Non RTV,10,10,Good,A,2026-09-14",
        "L006,Dallas,DALLX-HEADPHONES,Specialty,Headphones,FALSE,,Non RTV,40,40,Good,A,2026-09-14",
        "L007,Office,MIAFL-HEAD-OFFICE,Office,Computers,FALSE,,Non RTV,25,25,Good,A,2026-09-14",
      ],
    );
    const job = await upload("listable", listable, "listable-fixture.csv");
    expect(job.status).toBe("completed");

    const titles = await pool.query(
      `SELECT trgid, title, program_name, facility FROM inventory_items ORDER BY trgid`,
    );
    const byId = Object.fromEntries(titles.rows.map((r) => [r.trgid, r]));
    expect(byId.L001.title).toBe("Last wins");
    expect(byId.LREW.program_name).toBe("BRTON-WM-DOTCA-RTV");
    expect(byId.LREW.facility).toBe("BRTON");
    expect(byId.DROP1).toBeUndefined();
    expect(byId.DROP2).toBeUndefined();
    expect(Object.keys(byId).sort()).toEqual([
      "L001",
      "L002",
      "L003",
      "L004",
      "L005",
      "L006",
      "L007",
      "LREW",
    ]);
  });

  it("overwrites sold fields including blanks and never changes listable fields", async () => {
    const listable = writeCsv(
      "listable-keep.csv",
      "TRGID,Title,ProgramName,LocationNotListable,RTVType,UPCRetail,FirstStoredOnListableLocationOn",
      ["KEEP1,Keep me,BRTON-WM-FOO,FALSE,Non RTV,80,2026-09-14"],
    );
    await upload("listable", listable, "listable-keep.csv");

    const sold1 = writeCsv(
      "sold-first.csv",
      "TRGID,ProgramName,Sale Price (Discount applied),Order Type Sold On,Marketplace Sold On,OrderCreatedDate,SortingIndex,LocationID",
      ["KEEP1,BRTON-WM-FOO,40,Retail,Walmart,2026-09-14,SI-1,LOC-1"],
    );
    await upload("sold", sold1, "sold-first.csv");

    const sold2 = writeCsv(
      "sold-second.csv",
      "TRGID,ProgramName,Sale Price (Discount applied),Order Type Sold On,Marketplace Sold On,OrderCreatedDate,SortingIndex,LocationID",
      ["KEEP1,BRTON-WM-FOO,55,Wholesale,,2026-09-14,,"],
    );
    await upload("sold", sold2, "sold-second.csv");

    const row = (
      await pool.query(`SELECT * FROM inventory_items WHERE trgid = 'KEEP1'`)
    ).rows[0];
    expect(row.title).toBe("Keep me");
    expect(row.program_name).toBe("BRTON-WM-FOO");
    expect(row.upc_retail).toBe("80");
    expect(Number(row.sale_price)).toBe(55);
    expect(row.order_type_sold_on).toBe("Wholesale");
    expect(row.marketplace_sold_on).toBeNull();
    expect(row.sorting_index).toBeNull();
    expect(row.location_id).toBeNull();
  });

  it("rolls back when a file has no usable rows", async () => {
    const listable = writeCsv(
      "listable-ok.csv",
      "TRGID,ProgramName,LocationNotListable,RTVType,UPCRetail,FirstStoredOnListableLocationOn",
      ["OK1,BRTON-WM-FOO,FALSE,Non RTV,80,2026-09-14"],
    );
    await upload("listable", listable, "listable-ok.csv");

    const bad = writeCsv(
      "sold-bad.csv",
      "TRGID,ProgramName,Sale Price (Discount applied),OrderCreatedDate",
      [",BRTON-WM-FOO,10,2026-09-14", "X1,DS-MERCORP,10,2026-09-14"],
    );
    const job = await upload("sold", bad, "sold-bad.csv");
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/No rows were imported/);

    const count = await pool.query(`SELECT COUNT(*)::int AS n FROM inventory_items`);
    expect(count.rows[0].n).toBe(1);
    const history = await pool.query(`SELECT COUNT(*)::int AS n FROM upload_history`);
    expect(history.rows[0].n).toBe(1);
  });
});

describe("metrics", () => {
  async function seed() {
    const listable = writeCsv(
      "metrics-listable.csv",
      "TRGID,ProgramName,MasterProgramName,CategoryName,LocationNotListable,PalletLocationID,RTVType,MR_LMR_UPC_AverageCategoryRetail,UPCRetail,Classification_PHYSICAL CONDITION,Classification_CONDITION,FirstStoredOnListableLocationOn",
      [
        "L001,BRTON-WM-FOO,Walmart Computer Parts (Finished),Computers,FALSE,,Non RTV,100,80,Good,A,2026-09-14",
        "L002,BRTON-WM-BAR,Other Master,TVs,FALSE,PAL-1,Non RTV,50,60,Fair,B,2026-09-14",
        "L003,BRTON-WM-FOO,Other Master,Computers,TRUE,,Non RTV,10,10,Good,A,2026-09-14",
        "L004,BRTON-WM-FOO,Other Master,Computers,FALSE,,RTV,10,10,Good,A,2026-09-14",
        "L005,WFS-SOMETHING,Other Master,Computers,FALSE,,Non RTV,10,10,Good,A,2026-09-14",
        "L006,DALLX-HEADPHONES,Specialty,Headphones,FALSE,,Non RTV,40,40,Good,A,2026-09-14",
        "L007,MIAFL-HEAD-OFFICE,Office,Computers,FALSE,,Non RTV,25,25,Good,A,2026-09-14",
        "L008,BRTON-WM-PAL,Other Master,TVs,FALSE,PAL-2,Non RTV,100,100,Fair,B,2026-09-14",
        "L009,BRTON-WM-PAL,Other Master,TVs,FALSE,PAL-3,Non RTV,100,100,Fair,B,2026-09-14",
      ],
    );
    const sold = writeCsv(
      "metrics-sold.csv",
      "TRGID,ProgramName,MasterProgramName,CategoryName,Classification_PHYSICAL CONDITION,Classification_CONDITION,RTVType,Sale Price (Discount applied),Retail Price On Sale Date,MR_LMR_UPC_AverageCategoryRetail,UPCRetail,Order Type Sold On,Marketplace Sold On,OrderCustomerName,OrderCustomerCompanyName,SortingIndex,LocationID,OrderCreatedDate",
      [
        "L001,BRTON-WM-FOO,Walmart Computer Parts (Finished),Computers,Good,A,Non RTV,40,80,100,80,Retail,Walmart,Jane,Acme,,,2026-09-14",
        "L002,BRTON-WM-BAR,Other Master,TVs,Fair,B,Non RTV,30,50,50,60,Retail,Walmart,Jane,Acme,SI-1,LOC-1,2026-09-14",
        "L006,DALLX-HEADPHONES,Specialty,Headphones,Good,A,Non RTV,20,40,40,40,Retail,eBay,Jane,Acme,,,2026-09-14",
        "L007,MIAFL-HEAD-OFFICE,Office,Computers,Good,A,Non RTV,12,25,25,25,Retail,Walmart,Jane,Acme,,,2026-09-14",
        "L008,BRTON-WM-PAL,Other Master,TVs,Fair,B,Non RTV,200,100,100,100,Retail,Walmart,Jane,Acme,SI-8,LOC-HOT,2026-09-14",
        "L009,BRTON-WM-PAL,Other Master,TVs,Fair,B,Non RTV,80,100,100,100,Retail,Walmart,Jane,Acme,SI-9,LOC-OK,2026-09-14",
        "L010,BRTON-WM-RECON,Other Master,TVs,Fair,B,Non RTV,15,20,20,20,Retail,Walmart,Other,The Recon Group LLP,SI-R,LOC-R,2026-09-14",
        "L011,BRTON-WM-SEND,Other Master,TVs,Fair,B,Non RTV,15,20,20,20,Retail,Walmart,Sender Shamiss,Acme,SI-S,LOC-S,2026-09-14",
        "L012,BRTON-WM-ZERO,Other Master,TVs,Fair,B,Non RTV,0,20,20,20,Retail,Walmart,Jane,Acme,,,2026-09-14",
      ],
    );
    await upload("listable", listable, "metrics-listable.csv");
    await upload("sold", sold, "metrics-sold.csv");
  }

  it("computes executive KPIs from listable vs sold definitions", async () => {
    await seed();
    const kpis = await executiveKpis(filters);
    // Listable Non-RTV yesterday: L001, L002, L005, L006, L007, L008, L009 (L003 not listable, L004 RTV)
    expect(kpis.listableUnits).toBe(7);
    // Sold price > 0: L001, L002, L006, L007, L008, L009, L010, L011 (L012 is 0)
    expect(kpis.soldUnits).toBe(8);
    expect(kpis.sellThrough).toBeCloseTo(8 / 7);
    // retail: 80+50+10+40+25+100+100 = 405
    expect(kpis.listableRetailValue).toBe(405);
    // GMV: 40+30+20+12+200+80+15+15 = 412
    expect(kpis.soldGmv).toBe(412);
    expect(kpis.recovery).toBeCloseTo(412 / 405);
  });

  it("groups Walmart finished programs and sorts scorecard by sell-through", async () => {
    await seed();
    const { rows } = await facilityScorecard(filters, "units");
    expect(rows.map((r) => r.facility)).not.toContain("WFS");
    expect(rows.map((r) => r.facility)).not.toContain("MIAFL");
    const brton = rows.find((r) => r.facility === "BRTON");
    expect(brton).toBeTruthy();
    const sellThroughs = rows.map((r) => r.sellThrough ?? Number.POSITIVE_INFINITY);
    const sorted = [...sellThroughs].sort((a, b) => a - b);
    expect(sellThroughs).toEqual(sorted);

    const weeks = await weeklyUnits({ ...filters, from: null, to: null, productType: "All" });
    const inspect = weeks.rows
      .flatMap((r) => r.children)
      .find((c) => c.label === "Walmart Inspect and Sell (Finished)");
    expect(inspect?.putawayQty).toBeGreaterThanOrEqual(1);
  });

  it("drops pallet recovery above 150% from the percentage only", async () => {
    await seed();
    const { rows } = await facilityScorecard(filters, "pallets");
    const brton = rows.find((r) => r.facility === "BRTON")!;
    // Pallet sold after exclusions: L002 LOC-1 (30/50=60%), L008 LOC-HOT (200%), L009 LOC-OK (80%)
    // Recon and Shamiss excluded. Pallet count still includes LOC-HOT.
    expect(brton.sold).toBeGreaterThanOrEqual(3);
    // Average of 0.6 and 0.8 (200% dropped) = 0.7
    expect(brton.recovery).toBeCloseTo(0.7);
  });

  it("hard-excludes RTV, office program, $0, and pallet units from Data/Category tabs", async () => {
    await seed();
    const weeks = await weeklyUnits(filters);
    const totals = weeks.totals;
    // Loose listable Non-RTV excluding MIAFL-HEAD-OFFICE: L001, L005 (WFS), L006
    expect(totals.putawayQty).toBe(3);
    // Loose sold: L001 (40), L006 (20). L007 excluded by program, L012 is $0, pallets excluded
    expect(totals.soldQty).toBe(2);
    expect(totals.soldGmv).toBe(60);

    const cats = await categoryUnits(filters);
    expect(cats.totals.recovery).toBeCloseTo(60 / (80 + 10 + 40));
    const computers = cats.rows.find((r) => r.label === "Computers");
    expect(computers?.children.some((c) => c.label === "Good / A")).toBe(true);
  });
});
