import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import type { UploadType } from "../types";
import {
  clearAllData,
  createJob,
  getJob,
  listHistory,
  processUpload,
} from "../services/upload";
import { hasData } from "../services/metrics";

const uploadDir = path.join(os.tmpdir(), "listable-uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".bin";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === ".csv" || ext === ".xlsx") {
      cb(null, true);
      return;
    }
    cb(new Error("Please upload a .xlsx or .csv file."));
  },
});

export const uploadsRouter = Router();

function receiveFile(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      res.status(400).json({
        error: message.includes("File too large")
          ? "File is too large. Maximum size is 300 MB."
          : message,
      });
      return;
    }
    next();
  });
}

async function enqueue(uploadType: UploadType, req: Request, res: Response) {
  if (!req.file) {
    res.status(400).json({ error: "Choose a .xlsx or .csv file to upload." });
    return;
  }
  const jobId = randomUUID();
  const filename = req.file.originalname;
  const filePath = req.file.path;
  const job = await createJob(jobId, uploadType, filename);
  void processUpload(jobId, uploadType, filename, filePath);
  res.status(202).json(job);
}

uploadsRouter.post("/listable", receiveFile, (req, res) => enqueue("listable", req, res));
uploadsRouter.post("/sold", receiveFile, (req, res) => enqueue("sold", req, res));

uploadsRouter.get("/jobs/:id", async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Upload job not found." });
    return;
  }
  res.json(job);
});

uploadsRouter.get("/history", async (_req, res) => {
  res.json({ history: await listHistory() });
});

uploadsRouter.get("/status", async (_req, res) => {
  res.json(await hasData());
});

uploadsRouter.delete("/data", async (_req, res) => {
  await clearAllData();
  res.json({ ok: true });
});
