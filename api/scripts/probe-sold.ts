import { parseFile, soldToCopyFields } from "../src/services/parser";
async function main() {
  let n = 0;
  const t0 = Date.now();
  for await (const record of parseFile("/workspace/data/sold.xlsx", "sold")) {
    n++;
    if (n === 1) console.log("first", record);
  }
  console.log("sold rows", n, "ms", Date.now() - t0);
}
main().catch((e) => { console.error(e); process.exit(1); });
