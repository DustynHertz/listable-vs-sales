import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://listable:listable@127.0.0.1:5432/listable";

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
});
