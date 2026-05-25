import { Router } from "express";
import { buildTechnicalResponse } from "../utils/indicators.js";
import { withCache } from "../services/cache.js";
import { fetchMajorHolders } from "../services/tdcc.js";
import { fetchInstitutional } from "../services/twse.js";
import { fetchOpenApiStockSummary } from "../services/twseOpenApi.js";
import type { DashboardResponse } from "../types.js";

export const apiRouter = Router();

function validateStockId(id: string): string {
  const normalized = id.trim().toUpperCase();
  if (!/^[0-9A-Z]{2,10}(\.(TW|TWO))?$/u.test(normalized)) {
    throw new Error("股票代號格式不正確");
  }
  return normalized;
}

apiRouter.get("/stock/:id", async (req, res, next) => {
  try {
    const id = validateStockId(req.params.id);
    res.json(await fetchOpenApiStockSummary(id));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/technical/:id", async (req, res, next) => {
  try {
    const id = validateStockId(req.params.id);
    const stock = await fetchOpenApiStockSummary(id);
    const latestDate = stock.candles.at(-1)?.time ?? "none";
    const technical = await withCache(
      `technical:v1:${id}:${latestDate}:${stock.candles.length}`,
      60,
      async () => buildTechnicalResponse(id, stock.candles)
    );
    res.json(technical);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/dashboard/:id", async (req, res, next) => {
  try {
    const id = validateStockId(req.params.id);
    const normalizedId = id.replace(/\.(TW|TWO)$/u, "");
    const stock = await fetchOpenApiStockSummary(id);
    const latestDate = stock.candles.at(-1)?.time ?? "none";

    const dashboard = await withCache<DashboardResponse>(
      `dashboard:v1:${id}:${latestDate}:${stock.candles.length}`,
      30,
      async () => {
        const technical = buildTechnicalResponse(id, stock.candles);
        const [institutional, majorHolders] = await Promise.all([
          fetchInstitutional(normalizedId),
          fetchMajorHolders(normalizedId)
        ]);

        return {
          id: normalizedId,
          stock,
          technical,
          institutional,
          majorHolders,
          fetchedAt: new Date().toISOString()
        };
      }
    );

    res.json(dashboard);
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/institutional/:id", async (req, res, next) => {
  try {
    const id = validateStockId(req.params.id).replace(/\.(TW|TWO)$/u, "");
    res.json(await fetchInstitutional(id));
  } catch (error) {
    next(error);
  }
});

apiRouter.get("/majorholders/:id", async (req, res, next) => {
  try {
    const id = validateStockId(req.params.id).replace(/\.(TW|TWO)$/u, "");
    res.json(await fetchMajorHolders(id));
  } catch (error) {
    next(error);
  }
});
