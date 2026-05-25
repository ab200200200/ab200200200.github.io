import { Router } from "express";
import type { DashboardResponse } from "../types.js";
import { withCache } from "../services/cache.js";
import { runDailyMarketSync, runWeeklyMajorHolderSync } from "../services/dataSync.js";
import { fetchMajorHolders } from "../services/tdcc.js";
import { fetchInstitutional } from "../services/twse.js";
import { fetchOpenApiStockSummary } from "../services/twseOpenApi.js";
import { buildTechnicalResponse } from "../utils/indicators.js";

export const apiRouter = Router();

function validateStockId(id: string): string {
  const normalized = id.trim().toUpperCase();
  if (!/^[0-9A-Z]{2,10}(\.(TW|TWO))?$/u.test(normalized)) {
    throw new Error("股票代號格式不正確。");
  }
  return normalized;
}

function canRunAdminSync(token: string | undefined): boolean {
  const expectedToken = process.env.SYNC_ADMIN_TOKEN?.trim();
  if (!expectedToken) return false;
  return token === expectedToken;
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
      `technical:v2:${id}:${latestDate}:${stock.candles.length}`,
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
      `dashboard:v2:${normalizedId}:${latestDate}:${stock.candles.length}`,
      30,
      async () => {
        const technical = buildTechnicalResponse(normalizedId, stock.candles);
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

apiRouter.post("/admin/sync/daily", async (req, res, next) => {
  try {
    const token = String(req.query.token ?? req.body?.token ?? "");
    if (!canRunAdminSync(token)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const result = await runDailyMarketSync();
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

apiRouter.post("/admin/sync/majorholders", async (req, res, next) => {
  try {
    const token = String(req.query.token ?? req.body?.token ?? "");
    if (!canRunAdminSync(token)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const result = await runWeeklyMajorHolderSync();
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});
