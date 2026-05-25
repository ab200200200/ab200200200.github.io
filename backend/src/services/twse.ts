import type { InstitutionalRecord, InstitutionalResponse } from "../types.js";
import { loadInstitutional, upsertInstitutional } from "./marketDataStore.js";
import { parseNumber } from "../utils/number.js";
import { withCache } from "./cache.js";
import { http } from "./http.js";

type TwseT86Response = {
  fields?: string[];
  data?: string[][];
};

type TpexDailyTradeResponse = {
  fields?: string[];
  aaData?: string[][];
  data?: string[][];
};

type FinMindInstitutionalRow = {
  date: string;
  stock_id: string;
  buy: number | string;
  sell: number | string;
  name: string;
};

type FinMindResponse<T> = {
  data?: T[];
};

type FetchInstitutionalOptions = {
  preferDatabase?: boolean;
};

type DateResult = InstitutionalRecord | null;

const TWSE_T86_URL = "https://www.twse.com.tw/fund/T86";
const TPEX_DAILY_TRADE_URL = "https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade_hedge_result.php";
const FINMIND_DATA_URL = "https://api.finmindtrade.com/api/v4/data";

function formatTwseDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function formatRocDate(yyyyMMdd: string): string {
  const year = Number(yyyyMMdd.slice(0, 4)) - 1911;
  return `${year}/${yyyyMMdd.slice(4, 6)}/${yyyyMMdd.slice(6, 8)}`;
}

function displayDate(yyyyMMdd: string): string {
  return `${yyyyMMdd.slice(0, 4)}-${yyyyMMdd.slice(4, 6)}-${yyyyMMdd.slice(6, 8)}`;
}

function normalizeKey(value: string): string {
  return value.replace(/\s+/gu, "");
}

function findIndex(fields: string[], patterns: string[]): number {
  const normalizedPatterns = patterns.map(normalizeKey);
  const normalizedFields = fields.map(normalizeKey);
  const exactIndex = normalizedFields.findIndex((field) => normalizedPatterns.some((pattern) => field === pattern));
  if (exactIndex >= 0) return exactIndex;
  return normalizedFields.findIndex((field) => normalizedPatterns.some((pattern) => field.includes(pattern)));
}

function findCodeIndex(fields: string[]): number {
  const index = findIndex(fields, ["證券代號", "股票代號", "代號", "Code"]);
  return index >= 0 ? index : 0;
}

function pickByField(fields: string[], row: string[], patterns: string[]): number | null {
  const index = findIndex(fields, patterns);
  return index >= 0 ? parseNumber(row[index] ?? "0") : null;
}

function parseTwseT86(stockId: string, date: string, payload: TwseT86Response): DateResult {
  const fields = payload.fields ?? [];
  const rows = payload.data ?? [];
  const codeIndex = findCodeIndex(fields);
  const row = rows.find((item) => item[codeIndex]?.trim() === stockId);
  if (!row) return null;

  const foreignInvestor =
    pickByField(fields, row, ["外陸資買賣超股數(不含外資自營商)", "外資及陸資買賣超股數", "外資買賣超股數"]) ?? 0;
  const investmentTrust = pickByField(fields, row, ["投信買賣超股數", "投信買賣超"]) ?? 0;
  const dealer = pickByField(fields, row, ["自營商買賣超股數", "自營商買賣超"]) ?? 0;

  return {
    date: displayDate(date),
    foreignInvestor,
    investmentTrust,
    dealer,
    total: foreignInvestor + investmentTrust + dealer
  };
}

function parseTpexDailyTrade(stockId: string, date: string, payload: TpexDailyTradeResponse): DateResult {
  const rows = payload.aaData ?? payload.data ?? [];
  const fields = payload.fields ?? [];
  if (!rows.length) return null;

  const codeIndex = fields.length ? findCodeIndex(fields) : 0;
  const row = rows.find((item) => item[codeIndex]?.trim() === stockId);
  if (!row) return null;

  const foreignInvestor = fields.length
    ? pickByField(fields, row, ["外資及陸資買賣超", "外資買賣超", "外資及陸資(不含外資自營商)買賣超股數"]) ?? 0
    : parseNumber(row[4] ?? "0");
  const investmentTrust = fields.length
    ? pickByField(fields, row, ["投信買賣超", "投信買賣超股數"]) ?? 0
    : parseNumber(row[7] ?? "0");
  const dealer = fields.length
    ? pickByField(fields, row, ["自營商買賣超", "自營商買賣超股數"]) ?? 0
    : parseNumber(row[10] ?? "0");

  return {
    date: displayDate(date),
    foreignInvestor,
    investmentTrust,
    dealer,
    total: foreignInvestor + investmentTrust + dealer
  };
}

function toDateFloorString(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function parseFinMindInstitutional(stockId: string, rows: FinMindInstitutionalRow[]): InstitutionalRecord[] {
  const byDate = new Map<string, InstitutionalRecord>();

  for (const row of rows) {
    if (row.stock_id !== stockId) continue;

    const normalizedDate = String(row.date).slice(0, 10);
    const existing = byDate.get(normalizedDate) ?? {
      date: normalizedDate,
      foreignInvestor: 0,
      investmentTrust: 0,
      dealer: 0,
      total: 0
    };

    const net = parseNumber(row.buy) - parseNumber(row.sell);
    if (row.name === "Foreign_Investor") existing.foreignInvestor += net;
    if (row.name === "Investment_Trust") existing.investmentTrust += net;
    if (row.name === "Dealer_self" || row.name === "Dealer_Hedging" || row.name === "Foreign_Dealer_Self") {
      existing.dealer += net;
    }

    existing.total = existing.foreignInvestor + existing.investmentTrust + existing.dealer;
    byDate.set(normalizedDate, existing);
  }

  return [...byDate.values()].sort((left, right) => right.date.localeCompare(left.date));
}

async function fetchFinMindInstitutional(stockId: string): Promise<InstitutionalRecord[]> {
  const response = await http.get<FinMindResponse<FinMindInstitutionalRow>>(FINMIND_DATA_URL, {
    timeout: 9_000,
    params: {
      dataset: "TaiwanStockInstitutionalInvestorsBuySell",
      data_id: stockId,
      start_date: toDateFloorString(420)
    }
  });
  return parseFinMindInstitutional(stockId, response.data.data ?? []);
}

async function fetchTwseByDate(stockId: string, date: string): Promise<DateResult> {
  try {
    const response = await http.get<TwseT86Response>(TWSE_T86_URL, {
      timeout: 4_500,
      params: {
        response: "json",
        date,
        selectType: "ALLBUT0999"
      }
    });
    return parseTwseT86(stockId, date, response.data);
  } catch {
    return null;
  }
}

async function fetchTpexByDate(stockId: string, date: string): Promise<DateResult> {
  try {
    const response = await http.get<TpexDailyTradeResponse>(TPEX_DAILY_TRADE_URL, {
      timeout: 4_500,
      params: {
        l: "zh-tw",
        o: "json",
        se: "EW",
        t: "D",
        d: formatRocDate(date),
        s: "0,asc"
      }
    });
    return parseTpexDailyTrade(stockId, date, response.data);
  } catch {
    return null;
  }
}

async function fetchInstitutionalByDate(stockId: string, date: string): Promise<DateResult> {
  return withCache(`institutional:date:v1:${stockId}:${date}`, 60 * 60 * 12, async () => {
    const [twse, tpex] = await Promise.all([fetchTwseByDate(stockId, date), fetchTpexByDate(stockId, date)]);
    return twse ?? tpex;
  });
}

function recentWeekdayDates(limit: number): string[] {
  const dates: string[] = [];
  const cursor = new Date();

  for (let scanned = 0; scanned < limit; scanned += 1) {
    if (scanned > 0) cursor.setDate(cursor.getDate() - 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) dates.push(formatTwseDate(cursor));
  }

  return dates;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

function calculateStreak(records: InstitutionalRecord[]): InstitutionalResponse["streak"] {
  const latestDirection = records[0]?.total > 0 ? "buy" : records[0]?.total < 0 ? "sell" : "flat";
  if (latestDirection === "flat") {
    return { buyDays: 0, sellDays: 0, direction: "flat" };
  }

  let days = 0;
  for (const record of records) {
    if (latestDirection === "buy" && record.total > 0) days += 1;
    else if (latestDirection === "sell" && record.total < 0) days += 1;
    else break;
  }

  return {
    buyDays: latestDirection === "buy" ? days : 0,
    sellDays: latestDirection === "sell" ? days : 0,
    direction: latestDirection
  };
}

async function loadFromDatabase(symbol: string): Promise<InstitutionalRecord[]> {
  const dbRecords = await loadInstitutional(symbol, 200);
  return dbRecords
    .map((record) => ({
      date: record.date,
      foreignInvestor: record.foreignInvestor,
      investmentTrust: record.investmentTrust,
      dealer: 0,
      total: record.foreignInvestor + record.investmentTrust
    }))
    .sort((left, right) => right.date.localeCompare(left.date));
}

export async function fetchInstitutional(
  stockId: string,
  options: FetchInstitutionalOptions = {}
): Promise<InstitutionalResponse> {
  const normalizedId = stockId.trim().toUpperCase().replace(/\.(TW|TWO)$/u, "");
  const preferDatabase = options.preferDatabase !== false;

  return withCache(`institutional:v2:${normalizedId}:${preferDatabase ? "db" : "remote"}`, 60 * 15, async () => {
    if (preferDatabase) {
      const fromDb = await loadFromDatabase(normalizedId);
      if (fromDb.length >= 20) {
        return {
          id: normalizedId,
          latest: fromDb[0] ?? null,
          records: fromDb,
          streak: calculateStreak(fromDb),
          warnings: []
        };
      }
    }

    let records: InstitutionalRecord[] = [];
    try {
      records = (await fetchFinMindInstitutional(normalizedId)).slice(0, 140);
    } catch {
      records = [];
    }

    if (!records.length) {
      const dates = recentWeekdayDates(120);
      records = (await mapWithConcurrency(dates, 12, (date) => fetchInstitutionalByDate(normalizedId, date)))
        .filter((record): record is InstitutionalRecord => record !== null)
        .slice(0, 100);
    }

    if (records.length) {
      await Promise.allSettled([upsertInstitutional(normalizedId, records)]);
    }

    return {
      id: normalizedId,
      latest: records[0] ?? null,
      records,
      streak: calculateStreak(records),
      warnings: records.length ? [] : ["外資/投信資料暫時抓不到，請稍後再試。"]
    };
  });
}
