import type { Candle, StockSummary } from "../types.js";
import { parseNumber, round } from "../utils/number.js";
import { getCached, withCache } from "./cache.js";
import { http } from "./http.js";
import { fetchTwseHistoricalCandles } from "./twseHistorical.js";
import { fetchStockSummary } from "./yahooFinance.js";

const TWSE_OPENAPI_BASE_URL = "https://openapi.twse.com.tw/v1";

type TwseDailyRow = {
  Date: string;
  Code: string;
  Name: string;
  TradeVolume: string;
  TradeValue: string;
  OpeningPrice: string;
  HighestPrice: string;
  LowestPrice: string;
  ClosingPrice: string;
  Change: string;
  Transaction: string;
};

type OpenApiCoverage = {
  path: string;
  summary: string;
  use: string;
  limitation?: string;
};

export const OPENAPI_COVERAGE: OpenApiCoverage[] = [
  {
    path: "/exchangeReport/STOCK_DAY_ALL",
    summary: "上市個股日成交資訊",
    use: "最新上市股票/ETF 開高低收、成交量、漲跌、成交筆數",
    limitation: "只提供最新交易日全表，不提供單一個股多日歷史日 K"
  },
  {
    path: "/exchangeReport/STOCK_DAY_AVG_ALL",
    summary: "上市個股日收盤價及月平均價",
    use: "最新收盤價與月平均價參考",
    limitation: "不是日 K 歷史序列"
  },
  {
    path: "/exchangeReport/FMSRFK_ALL",
    summary: "上市個股月成交資訊",
    use: "月成交資訊",
    limitation: "月資料不能用來計算 MA5/MA10 等日線指標"
  },
  {
    path: "/exchangeReport/FMNPTK_ALL",
    summary: "上市個股年成交資訊",
    use: "年成交資訊",
    limitation: "年資料不能用來計算日線指標"
  },
  {
    path: "/opendata/t187ap03_L",
    summary: "上市公司基本資料",
    use: "公司基本資料",
    limitation: "ETF 不一定在此公司資料集內"
  },
  {
    path: "/fund/MI_QFIIS_cat",
    summary: "集中市場外資及陸資投資類股持股比率表",
    use: "外資持股比率類股資料",
    limitation: "不是個股三大法人買賣超"
  },
  {
    path: "/fund/MI_QFIIS_sort_20",
    summary: "集中市場外資及陸資持股前 20 名彙總表",
    use: "外資持股前 20 名",
    limitation: "不是指定個股外資/投信/自營商買賣超"
  }
];

function twseRocDateToIso(value: string): string {
  const digits = value.replace(/\D/gu, "");
  if (digits.length !== 7) return new Date().toISOString().slice(0, 10);
  const year = Number(digits.slice(0, 3)) + 1911;
  return `${year}-${digits.slice(3, 5)}-${digits.slice(5, 7)}`;
}

async function fetchOpenApi<T>(path: string, ttlSeconds: number): Promise<T> {
  return withCache(`twse-openapi:${path}`, ttlSeconds, async () => {
    const response = await http.get<T>(`${TWSE_OPENAPI_BASE_URL}${path}`);
    return response.data;
  });
}

async function fetchDailyRows(): Promise<TwseDailyRow[]> {
  return fetchOpenApi<TwseDailyRow[]>("/exchangeReport/STOCK_DAY_ALL", 60);
}

function daysBetweenToday(isoDate: string): number {
  const latest = new Date(`${isoDate}T00:00:00+08:00`).getTime();
  const today = new Date();
  const todayTaipei = new Date(
    `${today.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" })}T00:00:00+08:00`
  ).getTime();
  return Math.floor((todayTaipei - latest) / 86_400_000);
}

function mergeCandles(primary: Candle[], fallback: Candle[]): Candle[] {
  const byDate = new Map(primary.map((candle) => [candle.time, candle]));
  for (const candle of fallback) {
    if (!byDate.has(candle.time)) {
      byDate.set(candle.time, candle);
    }
  }
  return [...byDate.values()].sort((left, right) => left.time.localeCompare(right.time));
}

function hasRecentGap(candles: Candle[], lookbackDays = 180, maxGapDays = 12): boolean {
  if (candles.length < 2) return false;

  const sorted = [...candles].sort((left, right) => left.time.localeCompare(right.time));
  const cutoff = Date.now() - lookbackDays * 86_400_000;

  for (let index = 1; index < sorted.length; index += 1) {
    const leftTime = new Date(`${sorted[index - 1].time}T00:00:00+08:00`).getTime();
    const rightTime = new Date(`${sorted[index].time}T00:00:00+08:00`).getTime();
    if (rightTime < cutoff) continue;

    const gapDays = Math.floor((rightTime - leftTime) / 86_400_000);
    if (gapDays > maxGapDays) return true;
  }

  return false;
}

function buildStockWarnings(row: TwseDailyRow, candles: Candle[]): string[] {
  const latestCandle = candles.at(-1);
  const warnings: string[] = [];

  if (!latestCandle) {
    return ["查無可用日 K 資料，無法計算技術指標。"];
  }

  if (candles.length < 5) {
    warnings.push("日 K 少於 5 根，無法計算 MA5 與 5 日均量。");
  } else if (candles.length < 60) {
    warnings.push(`目前取得 ${candles.length} 根日 K，MA60 暫時無法完整計算。`);
  }

  if (latestCandle.volume <= 0) {
    warnings.push("成交量為 0 或空值，對一般熱門股票/ETF 不合理，請檢查來源資料是否停牌、休市或欄位異常。");
  }

  if (latestCandle.close <= 0 || latestCandle.open <= 0 || latestCandle.high <= 0 || latestCandle.low <= 0) {
    warnings.push("OHLC 價格含 0 或空值，K 線資料不合理。");
  }

  if (
    latestCandle.high < Math.max(latestCandle.open, latestCandle.close) ||
    latestCandle.low > Math.min(latestCandle.open, latestCandle.close)
  ) {
    warnings.push("高低價與開收盤價不一致，K 線資料不合理。");
  }

  if (daysBetweenToday(latestCandle.time) > 7) {
    warnings.push(`最新交易日為 ${latestCandle.time}，距今超過 7 天，可能不是即時資料。`);
  }

  if (!row.Name.trim()) {
    warnings.push("股票名稱為空，基本資料可能不完整。");
  }

  return warnings;
}

export async function fetchOpenApiStockSummary(stockId: string): Promise<StockSummary> {
  const normalizedId = stockId.trim().toUpperCase().replace(/\.(TW|TWO)$/u, "");
  const cacheKey = `stock:twse-openapi:v6:${normalizedId}`;
  const legacyCacheKey = `stock:twse-openapi:v5:${normalizedId}`;

  try {
    return await withCache(cacheKey, 60, async () => {
    const rows = await fetchDailyRows();
    const row = rows.find((item) => item.Code === normalizedId);

    if (!row) {
      throw new Error("TWSE OpenAPI 查無上市股票資料；目前此資料源不含上櫃股票或非上市商品。");
    }

    const open = round(parseNumber(row.OpeningPrice), 2);
    const high = round(parseNumber(row.HighestPrice), 2);
    const low = round(parseNumber(row.LowestPrice), 2);
    const close = round(parseNumber(row.ClosingPrice), 2);
    const change = round(parseNumber(row.Change), 2);
    const previousClose = round(close - change, 2);
    const changePercent = previousClose > 0 ? round((change / previousClose) * 100, 2) : 0;
    const volume = parseNumber(row.TradeVolume);
    const time = twseRocDateToIso(row.Date);

    const candle: Candle = {
      time,
      open,
      high,
      low,
      close,
      volume
    };
    let candles = await fetchTwseHistoricalCandles(normalizedId);
    let gapFilledCount = 0;
    let gapFillFailed = false;

    if (!candles.length) {
      candles = [candle];
    } else if (hasRecentGap(candles)) {
      try {
        const yahooSummary = await fetchStockSummary(normalizedId);
        const merged = mergeCandles(candles, yahooSummary.candles);
        gapFilledCount = Math.max(0, merged.length - candles.length);
        candles = merged;
      } catch {
        gapFillFailed = true;
      }
    }

    const warnings = buildStockWarnings(row, candles);
    if (gapFilledCount > 0) {
      warnings.unshift(`TWSE 歷史日 K 有缺口，已自動補齊 ${gapFilledCount} 筆資料。`);
    } else if (gapFillFailed) {
      warnings.unshift("TWSE 歷史日 K 疑似缺口，但備援補齊失敗。");
    }
    const latestHistoricalCandle = candles.at(-1);

    if (latestHistoricalCandle && latestHistoricalCandle.time !== time) {
      warnings.push(
        `STOCK_DAY 最新日 K 為 ${latestHistoricalCandle.time}，OpenAPI 最新交易日為 ${time}，兩個來源日期不一致。`
      );
    }

    return {
      id: normalizedId,
      symbol: normalizedId,
      name: row.Name,
      exchange: "TWSE OpenAPI",
      currency: "TWD",
      price: close,
      change,
      changePercent,
      volume,
      previousClose,
      marketTime: `${time}T06:30:00.000Z`,
      candles,
      dataSource: "TWSE OpenAPI /v1/exchangeReport/STOCK_DAY_ALL + TWSE STOCK_DAY",
      warnings,
      dataQuality: {
        candleCount: candles.length,
        hasHistoricalDailyCandles: candles.length > 1,
        latestDate: latestHistoricalCandle?.time ?? time
      }
    };
    });
  } catch (error) {
    const legacy = getCached<StockSummary>(legacyCacheKey);
    if (legacy) return legacy;
    throw error;
  }
}
