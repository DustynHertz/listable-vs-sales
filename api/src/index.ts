import "dotenv/config";
import express from "express";
import cors from "cors";
import { migrate } from "./db/migrate";
import { pool } from "./db/pool";
import { uploadsRouter } from "./routes/uploads";
import { metricsRouter } from "./routes/metrics";
import path from "node:path";
import fs from "node:fs";

const app = express();
const port = Number(process.env.PORT || 43124);

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/uploads", uploadsRouter);
app.use("/api/metrics", metricsRouter);

const webDist = path.resolve(process.cwd(), "../web/dist");
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const message = err instanceof Error ? err.message : "Unexpected server error.";
    const isUpload =
      message.includes(".xlsx") ||
      message.includes("file") ||
      message.includes("File too large");
    res.status(isUpload ? 400 : 500).json({ error: message });
  },
);

async function main() {
  await migrate();
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`API listening on http://0.0.0.0:${port}`);
  });
  server.setTimeout(30 * 60 * 1000);
  server.headersTimeout = 31 * 60 * 1000;
  server.requestTimeout = 30 * 60 * 1000;
}

main().catch((err) => {
  console.error(err);
  void pool.end();
  process.exit(1);
});
