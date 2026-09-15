import { parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

try {
  const { inputPath, outputPath } = workerData;
  const workbook = XLSX.readFile(inputPath, {
    cellDates: true,
    dense: true,
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The workbook has no worksheets.");
  const sheet = workbook.Sheets[sheetName];
  const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
  fs.writeFileSync(outputPath, csv, "utf8");
  parentPort.postMessage({ ok: true, bytes: Buffer.byteLength(csv) });
} catch (err) {
  parentPort.postMessage({
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  });
}
