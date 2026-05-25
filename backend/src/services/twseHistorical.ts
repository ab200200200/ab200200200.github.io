import type { Candle } from "../types.js";
import { parseNumber, round } from "../utils/number.js";
import { getCached, setCached, withCache } from "./cache.js";
import { http } from "./http.js";

const TWSE_STOCK_DAY_URL = "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY";

type TwseStockDayResponse = {
  stat?: string;
  date?: string;
  title?: string;
  fields?: string[];
  data?: string[][];
};

const STOCK_DAY_CACHE_TTL = 60 * 60 * 12;

function formatMonthStart(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${yyyy}${mm}01`;
}

function getRecentMonthStarts(months: number): string[] {
  const cursor = new Date();
  cursor.setDate(1);

  return Array.from({ length: months }, (_, index) => {
    const date = new Date(cursor);
    date.setMonth(cursor.getMonth() - index);
    return formatMonthStart(date);
  });
}

function rocDateToIso(value: string): string | null {
  const digits = value.replace(/\D/gu, "");
  if (digits.length !== 7) return null;

  const year = Number(digits.slice(0, 3)) + 1911;
  const month = digits.slice(3, 5);
  const day = digits.slice(5, 7);
  return `${year}-${month}-${day}`;
}

function parseCandle(row: string[]): Candle | null {
  const time = rocDateToIso(row[0] ?? "");
  if (!time) return null;

  const volume = parseNumber(row[1]);
  const open = round(parseNumber(row[3]), 2);
  const high = round(parseNumber(row[4]), 2);
  const low = round(parseNumber(row[5]), 2);
  const close = round(parseNumber(row[6]), 2);

  if (!open || !high || !low || !close) return null;

  return {
    time,
    open,
    high,
    low,
    close,
    volume
  };
}

function monthDistanceFromNow(monthStart: string): number {
  const year = Number(monthStart.slice(0, 4));
  const month = Number(monthStart.slice(4, 6)) - 1;
  const start = new Date(year, month, 1);
  const now = new Date();
  return (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
}

function shouldRetryEmptyMonth(monthStart: string): boolean {
  return monthDistanceFromNow(monthStart) <= 8;
}

async function fetchStockDayMonthRaw(stockId: string, date: string, cacheBuster?: number): Promise<Candle[]> {
  const response = await http.get<TwseStockDayResponse>(TWSE_STOCK_DAY_URL, {
    params: {
      response: "json",
      date,
      stockNo: stockId,
      ...(cacheBuster ? { _: cacheBuster } : {})
    }
  });

  const rows = response.data?.data ?? [];
  return rows
    .map(parseCandle)
    .filter((candle): candle is Candle => candle !== null);
}

async function fetchStockDayMonth(stockId: string, date: string): Promise<Candle[]> {
  const cacheKey = `twse:stock-day:v2:${stockId}:${date}`;
  const legacyCacheKey = `twse:stock-day:${stockId}:${date}`;
  let cached: Candle[];

  try {
    cached = await withCache(cacheKey, STOCK_DAY_CACHE_TTL, async () => fetchStockDayMonthRaw(stockId, date));
  } catch {
    const legacy = getCached<Candle[]>(legacyCacheKey);
    if (legacy?.length) {
      setCached(cacheKey, legacy, STOCK_DAY_CACHE_TTL);
      return legacy;
    }
    return [];
  }

  if (cached.length || !shouldRetryEmptyMonth(date)) {
    return cached;
  }

  try {
    const retried = await fetchStockDayMonthRaw(stockId, date, Date.now());
    if (retried.length) {
      setCached(cacheKey, retried, STOCK_DAY_CACHE_TTL);
      return retried;
    }
  } catch {
    // Keep empty cached result when retry fails.
  }

  return cached;
}

export async function fetchTwseHistoricalCandles(stockId: string, months = 72): Promise<Candle[]> {
  const monthStarts = getRecentMonthStarts(months);
  const candlesByDate = new Map<string, Candle>();

  for (const monthStart of monthStarts) {
    const monthlyCandles = await fetchStockDayMonth(stockId, monthStart);
    for (const candle of monthlyCandles) {
      candlesByDate.set(candle.time, candle);
    }
  }

  return [...candlesByDate.values()]
    .sort((left, right) => left.time.localeCompare(right.time))
    .slice(-1600);
}
