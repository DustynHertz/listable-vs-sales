import { Router } from "express";
import type { ProductTypeFilter, QueryFilters, UnitMode } from "../types";
import {
  categoryUnits,
  chartSeries,
  executiveKpis,
  facilityScorecard,
  filterOptions,
  weeklyUnits,
} from "../services/metrics";

export const metricsRouter = Router();

function parseFilters(query: Record<string, unknown>): QueryFilters {
  const productTypeRaw = String(query.productType ?? "Non-RTV");
  const productType: ProductTypeFilter =
    productTypeRaw === "RTV" || productTypeRaw === "All" ? productTypeRaw : "Non-RTV";
  const blank = (v: unknown) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === "" || s === "all" ? null : s;
  };
  return {
    from: blank(query.from),
    to: blank(query.to),
    facility: blank(query.facility),
    masterProgram: blank(query.masterProgram),
    productType,
    orderType: blank(query.orderType),
    marketplace: blank(query.marketplace),
  };
}

function parseMode(query: Record<string, unknown>): UnitMode {
  return query.mode === "pallets" ? "pallets" : "units";
}

metricsRouter.get("/filters", async (_req, res) => {
  res.json(await filterOptions());
});

metricsRouter.get("/executive", async (req, res) => {
  res.json(await executiveKpis(parseFilters(req.query as Record<string, unknown>)));
});

metricsRouter.get("/chart", async (req, res) => {
  const q = req.query as Record<string, unknown>;
  res.json(await chartSeries(parseFilters(q), parseMode(q)));
});

metricsRouter.get("/scorecard", async (req, res) => {
  const q = req.query as Record<string, unknown>;
  res.json(await facilityScorecard(parseFilters(q), parseMode(q)));
});

metricsRouter.get("/weeks", async (req, res) => {
  res.json(await weeklyUnits(parseFilters(req.query as Record<string, unknown>)));
});

metricsRouter.get("/categories", async (req, res) => {
  res.json(await categoryUnits(parseFilters(req.query as Record<string, unknown>)));
});
