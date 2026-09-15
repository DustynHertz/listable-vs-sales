import ExcelJS from "exceljs";

async function main() {
  const t0 = Date.now();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile("/workspace/data/sold.xlsx");
  const ws = wb.worksheets[0];
  console.log("sheet", ws?.name, "rows", ws?.rowCount, "ms", Date.now()-t0);
  let n=0;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 2) console.log(rowNumber, row.values?.slice?.(1,8));
    n++;
  });
  console.log("iterated", n, "ms", Date.now()-t0);
}
main().catch(e => { console.error(e); process.exit(1); });
