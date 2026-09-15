import fs from "node:fs";
import path from "node:path";
import { pool } from "./pool";

async function waitForDb(): Promise<void> {
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      if (attempt === 30) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

export async function migrate(): Promise<void> {
  await waitForDb();
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pool.query(sql);
}

