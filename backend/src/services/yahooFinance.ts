import type { Candle, StockSummary } from "../types.js";
import { parseNumber, round, toIsoDate } from "../utils/number.js";
import { withCache } from "./cache.js";
import { http } from "./http.js";

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta: {
        symbol: string;
        exchangeName?: string;
        instrumentType?: string;
        currency?: string;
        regularMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketTime?: number;
        shortName?: string;
        longName?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      code: string;
      description: string;
    } | null;
  };
};

function normalizeTaiwanSymbol(id: string, marketSuffix = ".TW"): string {
  const cleaned = id.trim().toUpperCase();
  if (cleaned.endsWith(".TW") || cleaned.endsWith(".TWO")) return cleaned;
  return `${cleaned}${marketSuffix}`;
}

function parseYahooChart(id: string, response: YahooChartResponse): StockSummary {
  const result = response.chart?.result?.[0];
  if (!result || response.chart?.error) {
    throw new Error(response.chart?.error?.description ?? "Yahoo Finance 查無資料");
  }

  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  if (!quote || timestamps.length === 0) {
    throw new Error("Yahoo Finance 沒有回傳 K 線資料");
  }

  const candles: Candle[] = timestamps
    .map((timestamp, index) => {
      const open = quote.open?.[index];
      const high = quote.high?.[index];
      const low = quote.low?.[index];
      const close = quote.close?.[index];
      const volume = quote.volume?.[index];

      if (open === null || high === null || low === null || close === null) return null;

      return {
        time: toIsoDate(timestamp),
        open: round(parseNumber(open), 2),
        high: round(parseNumber(high), 2),
        low: round(parseNumber(low), 2),
        close: round(parseNumber(close), 2),
        volume: parseNumber(volume)
      };
    })
    .filter((candle): candle is Candle => candle !== null);

  const latest = candles.at(-1);
  const previous = candles.at(-2);
  const meta = result.meta;
  const price = round(meta.regularMarketPrice ?? latest?.close ?? 0, 2);
  const previousClose = round(meta.chartPreviousClose ?? meta.previousClose ?? previous?.close ?? price, 2);
  const change = round(price - previousClose, 2);
  const changePercent = previousClose > 0 ? round((change / previousClose) * 100, 2) : 0;

  return {
    id,
    symbol: meta.symbol,
    name: meta.longName ?? meta.shortName ?? meta.symbol.replace(/\.(TW|TWO)$/u, ""),
    exchange: meta.exchangeName ?? "TWSE/TPEX",
    currency: meta.currency ?? "TWD",
    price,
    change,
    changePercent,
    volume: latest?.volume ?? 0,
    previousClose,
    marketTime: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString(),
    candles,
    dataSource: "Yahoo Finance chart API",
    warnings: [],
    dataQuality: {
      candleCount: candles.length,
      hasHistoricalDailyCandles: candles.length >= 60,
      latestDate: latest?.time ?? null
    }
  };
}

async function fetchYahooSymbol(id: string, suffix: ".TW" | ".TWO"): Promise<StockSummary> {
  const symbol = normalizeTaiwanSymbol(id, suffix);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
  const response = await http.get<YahooChartResponse>(url, {
    params: {
      range: "1y",
      interval: "1d",
      events: "history",
      includeAdjustedClose: "true"
    }
  });

  return parseYahooChart(id, response.data);
}

export async function fetchStockSummary(id: string): Promise<StockSummary> {
  const stockId = id.trim().toUpperCase();
  return withCache(`stock:${stockId}`, 60, async () => {
    try {
      return await fetchYahooSymbol(stockId, ".TW");
    } catch (firstError) {
      try {
        return await fetchYahooSymbol(stockId, ".TWO");
      } catch {
        throw firstError;
      }
    }
  });
}
