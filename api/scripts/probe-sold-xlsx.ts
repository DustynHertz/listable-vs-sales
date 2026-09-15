import * as XLSX from "xlsx";

const t0 = Date.now();
const wb = XLSX.readFile("/workspace/data/sold.xlsx", { cellDates: true, dense: true });
const sheet = wb.Sheets[wb.SheetNames[0]];
console.log("sheets", wb.SheetNames, "ms", Date.now()-t0);
const rows = XLSX.utils.sheet_to_json<(string|number|Date|null)[]>(sheet, { header: 1, defval: null, raw: false });
console.log("rows", rows.length, "header", rows[0]?.slice?.(0,8));
console.log("row1", rows[1]?.slice?.(0,8));
console.log("ms", Date.now()-t0);
