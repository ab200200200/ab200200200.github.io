import type { StockSummary } from "../types.js";
import { round } from "../utils/number.js";
import { getCached, withCache } from "./cache.js";
import { loadCandles, upsertCandles } from "./marketDataStore.js";
import { pgQuery } from "./postgres.js";
import { fetchTwseHistoricalCandles } from "./twseHistorical.js";

type FetchStockSummaryOptions = {
  preferDatabase?: boolean;
};

function daysBetweenToday(isoDate: string): number {
  const latest = new Date(`${isoDate}T00:00:00+08:00`).getTime();
  const now = new Date();
  const yyyyMmDdTaipei = now.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  const today = new Date(`${yyyyMmDdTaipei}T00:00:00+08:00`).getTime();
  return Math.floor((today - latest) / 86_400_000);
}

function buildWarnings(candleCount: number, latestDate: string, latestVolume: number): string[] {
  const warnings: string[] = [];

  if (candleCount < 60) {
    warnings.push(`K線筆數偏少（${candleCount}），MA60 可能不完整。`);
  }

  if (latestVolume <= 0) {
    warnings.push("最新成交量為 0，可能是資料源當日尚未更新。");
  }

  if (daysBetweenToday(latestDate) > 7) {
    warnings.push(`最新資料日期為 ${latestDate}，距今超過 7 天。`);
  }

  return warnings;
}

async function loadNameFromDatabase(symbol: string): Promise<string | null> {
  try {
    const result = await pgQuery<{ name: string }>("SELECT name FROM stock_symbols WHERE symbol = $1 LIMIT 1", [symbol]);
    return result.rows[0]?.name ?? null;
  } catch {
    return null;
  }
}

async function buildSummaryFromCandles(symbol: string, sourceName: string, useStoredCandles = true): Promise<StockSummary> {
  const candles = useStoredCandles ? await loadCandles(symbol, 360) : await fetchTwseHistoricalCandles(symbol);
  if (!candles.length) {
    throw new Error(`找不到 ${symbol} 的 STOCK_DAY 日K資料。`);
  }

  if (!useStoredCandles) {
    await upsertCandles(symbol, candles);
  }

  const latest = candles.at(-1);
  if (!latest) {
    throw new Error(`找不到 ${symbol} 的最新K線。`);
  }

  const previous = candles.at(-2);
  const previousClose = previous?.close ?? latest.close;
  const change = round(latest.close - previousClose, 2);
  const changePercent = previousClose > 0 ? round((change / previousClose) * 100, 2) : 0;
  const name = (await loadNameFromDatabase(symbol)) ?? symbol;

  return {
    id: symbol,
    symbol,
    name,
    exchange: "TWSE/TPEX STOCK_DAY",
    currency: "TWD",
    price: latest.close,
    change,
    changePercent,
    volume: latest.volume,
    previousClose: round(previousClose, 2),
    marketTime: `${latest.time}T06:30:00.000Z`,
    candles,
    dataSource: sourceName,
    warnings: buildWarnings(candles.length, latest.time, latest.volume),
    dataQuality: {
      candleCount: candles.length,
      hasHistoricalDailyCandles: candles.length > 1,
      latestDate: latest.time
    }
  };
}

export async function fetchOpenApiStockSummary(
  stockId: string,
  options: FetchStockSummaryOptions = {}
): Promise<StockSummary> {
  const normalizedId = stockId.trim().toUpperCase().replace(/\.(TW|TWO)$/u, "");
  const cacheKey = `stock-summary:stock-day-only:v1:${normalizedId}`;
  const legacyCacheKey = `stock:twse-openapi:v6:${normalizedId}`;
  const preferDatabase = options.preferDatabase !== false;

  try {
    return await withCache(cacheKey, 30, async () => {
      if (preferDatabase) {
        try {
          const fromDb = await buildSummaryFromCandles(normalizedId, "Neon PostgreSQL (source: TWSE STOCK_DAY)", true);
          if (fromDb.candles.length >= 80) {
            return fromDb;
          }
        } catch {
          // Fallback to remote STOCK_DAY fetch below.
        }
      }

      return buildSummaryFromCandles(normalizedId, "TWSE STOCK_DAY", false);
    });
  } catch (error) {
    const legacy = getCached<StockSummary>(legacyCacheKey);
    if (legacy) return legacy;
    throw error;
  }
}
