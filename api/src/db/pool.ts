import { Pool } from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://listable:listable@127.0.0.1:5432/listable";

const needsSsl =
  /railway|rlwy\.net|sslmode=require/i.test(connectionString) ||
  process.env.PGSSLMODE === "require";

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 30_000,
  statement_timeout: 0,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});
