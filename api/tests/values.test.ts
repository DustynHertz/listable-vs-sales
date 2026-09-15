import { describe, expect, it } from "vitest";
import {
  excelSerialToISODate,
  facilityFromProgram,
  normalizeHeader,
  parseBoolean,
  parseDate,
  parseNumber,
  rewriteProgramName,
  shouldDropProgram,
} from "../src/utils/values";
import { mapHeaders } from "../src/utils/headers";
import { rowFromCells } from "../src/services/parser";

describe("header matching", () => {
  it("ignores case, spaces, and underscores", () => {
    expect(normalizeHeader("TRG ID")).toBe("trgid");
    expect(normalizeHeader("MR_LMR_UPC_AverageCategoryRetail")).toBe(
      "mrlmrupcaveragecategoryretail",
    );
    expect(normalizeHeader("Sale Price (Discount applied)")).toBe(
      "saleprice(discountapplied)",
    );
  });

  it("maps listable and sold headers", () => {
    const listable = mapHeaders(
      ["TRGID", "Program Name", "LocationNotListable", "FirstStoredOnListableLocationOn"],
      "listable",
    );
    expect(listable.map((c) => c.field)).toEqual([
      "trgid",
      "program_name",
      "location_not_listable",
      "first_stored_on_listable_location_on",
    ]);
    const sold = mapHeaders(
      ["trgid", "Sale Price (Discount applied)", "Order Created Date"],
      "sold",
    );
    expect(sold.map((c) => c.field)).toEqual(["trgid", "sale_price", "order_created_date"]);
  });
});

describe("value parsing", () => {
  it("strips $ and commas from numbers", () => {
    expect(parseNumber("$1,234.50")).toBe(1234.5);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(42)).toBe(42);
  });

  it("parses booleans", () => {
    expect(parseBoolean("FALSE")).toBe(false);
    expect(parseBoolean("Yes")).toBe(true);
    expect(parseBoolean(0)).toBe(false);
    expect(parseBoolean("")).toBeNull();
  });

  it("parses excel serial dates and ISO strings", () => {
    expect(excelSerialToISODate(45949)).toBe("2025-10-19");
    expect(parseDate("2026-09-14")).toBe("2026-09-14");
    expect(parseDate("9/14/2026")).toBe("2026-09-14");
    expect(parseDate(new Date(2026, 8, 14))).toBe("2026-09-14");
  });
});

describe("program transforms", () => {
  it("rewrites MILON program names and derives facility", () => {
    expect(rewriteProgramName("MILON-WM-DOTCA-RTV")).toBe("BRTON-WM-DOTCA-RTV");
    expect(facilityFromProgram("BRTON-WM-DOTCA-RTV")).toBe("BRTON");
    expect(shouldDropProgram("DS-MONTERREY")).toBe(true);
    expect(shouldDropProgram("BRTON-LENOVO-DC-402")).toBe(true);
    expect(shouldDropProgram("BRTON-WM-FOO")).toBe(false);
  });

  it("drops blank TRGID and excluded programs", () => {
    const columns = mapHeaders(["TRGID", "ProgramName", "Title"], "listable");
    expect(rowFromCells(["", "BRTON-WM-FOO", "x"], columns, "listable")).toBeNull();
    expect(rowFromCells(["T1", "DS-MERCORP", "x"], columns, "listable")).toBeNull();
    const kept = rowFromCells(["T1", "MILON-WM-DOTCA-RTV", "Widget"], columns, "listable");
    expect(kept).toMatchObject({
      trgid: "T1",
      program_name: "BRTON-WM-DOTCA-RTV",
      facility: "BRTON",
      title: "Widget",
    });
  });
});
