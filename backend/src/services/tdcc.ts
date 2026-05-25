import type { MajorHolderRecord, MajorHoldersResponse } from "../types.js";
import { parseNumber, round } from "../utils/number.js";
import { withCache } from "./cache.js";
import { http } from "./http.js";

const TDCC_QRY_STOCK_URL = "https://www.tdcc.com.tw/portal/zh/smWeb/qryStock";
const TDCC_MAJOR_HOLDER_LEVEL = "1,000,001";
const NORWAY_STOCK_HOLDERS_URL = "https://norway.twsthr.info/StockHolders.aspx";

type TdccSession = {
  html: string;
  cookie: string;
};

function normalizeDate(value: string): string {
  const digits = value.replace(/\D/gu, "");
  if (digits.length === 8) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return value.trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gu, " ")
    .replace(/<br\s*\/?>/giu, " ")
    .replace(/<\/?[^>]+>/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function extractInputValue(html: string, name: string): string {
  const pattern = new RegExp(`<input[^>]+name=["']${name}["'][^>]*>`, "iu");
  const input = html.match(pattern)?.[0] ?? "";
  return input.match(/value=["']([^"']*)["']/iu)?.[1] ?? "";
}

function extractAvailableDates(html: string): string[] {
  const options = [...html.matchAll(/<option[^>]+value=["'](\d{8})["'][^>]*>/giu)].map((match) => match[1]);
  if (options.length) return [...new Set(options)];
  return [...new Set([...html.matchAll(/\b20\d{6}\b/gu)].map((match) => match[0]))];
}

function parseTableCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/giu)].map((match) => decodeHtml(match[1]));
}

function parseMajorHolderRecord(html: string, date: string): MajorHolderRecord | null {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/giu)].map((match) => parseTableCells(match[1]));
  const row = rows.find((cells) => cells[1]?.includes(TDCC_MAJOR_HOLDER_LEVEL) || cells[0] === "15");
  if (!row || row.length < 5) return null;

  return {
    date: normalizeDate(date),
    percentage: round(parseNumber(row[4]), 2),
    shares: parseNumber(row[3]),
    holders: parseNumber(row[2])
  };
}

function parseNorwayHolderRows(html: string): MajorHolderRecord[] {
  const rowMatches = [...html.matchAll(/<tr class='l(?:D|L)S'>(.*?)(?:<\/tr>|<tr\/>)/giu)];
  return rowMatches
    .map((match) => parseTableCells(match[1]))
    .filter((cells) => cells.length >= 15 && /^\d{8}$/u.test(cells[2] ?? ""))
    .map((cells) => ({
      date: normalizeDate(cells[2]),
      percentage: round(parseNumber(cells[13]), 2),
      shares: parseNumber(cells[3]),
      holders: parseNumber(cells[12])
    }));
}

async function fetchNorwayFallback(stockId: string): Promise<MajorHolderRecord[]> {
  const response = await http.get<string>(NORWAY_STOCK_HOLDERS_URL, {
    timeout: 6000,
    params: { stock: stockId },
    responseType: "text",
    transformResponse: [(data) => data]
  });
  return parseNorwayHolderRows(response.data).slice(0, 120);
}

function serializeCookies(setCookie: string[] | string | undefined): string {
  if (!setCookie) return "";
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  return cookies.map((cookie) => cookie.split(";")[0]).filter(Boolean).join("; ");
}

async function fetchTdccLandingPage(): Promise<TdccSession> {
  const response = await http.get<string>(TDCC_QRY_STOCK_URL, {
    timeout: 6000,
    responseType: "text",
    transformResponse: [(data) => data]
  });
  return {
    html: response.data,
    cookie: serializeCookies(response.headers["set-cookie"])
  };
}

async function fetchTdccMajorHolderByDate(
  stockId: string,
  date: string,
  session: TdccSession
): Promise<MajorHolderRecord | null> {
  return withCache(`tdcc:major-holders:v2:${stockId}:${date}`, 60 * 60 * 24, async () => {
    const form = new URLSearchParams({
      SYNCHRONIZER_TOKEN: extractInputValue(session.html, "SYNCHRONIZER_TOKEN"),
      SYNCHRONIZER_URI: "/portal/zh/smWeb/qryStock",
      method: "submit",
      firDate: extractInputValue(session.html, "firDate") || date,
      scaDate: date,
      sqlMethod: "StockNo",
      stockNo: stockId,
      stockName: ""
    });

    const response = await http.post<string>(TDCC_QRY_STOCK_URL, form.toString(), {
      timeout: 6000,
      responseType: "text",
      transformResponse: [(data) => data],
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: TDCC_QRY_STOCK_URL,
        ...(session.cookie ? { Cookie: session.cookie } : {})
      }
    });

    return parseMajorHolderRecord(response.data, date);
  });
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

function calculateTrend(records: MajorHolderRecord[]): MajorHoldersResponse["trend"] {
  const latest = records[0]?.percentage ?? 0;
  const previous = records[1]?.percentage ?? latest;
  const fourWeeksAgo = records[4]?.percentage ?? previous;
  const fourWeekChange = round(latest - fourWeeksAgo, 2);
  const weeklyChange = round(latest - previous, 2);

  return {
    weeklyChange,
    fourWeekChange,
    direction: weeklyChange > 0 ? "up" : weeklyChange < 0 ? "down" : "flat"
  };
}

export async function fetchMajorHolders(stockId: string): Promise<MajorHoldersResponse> {
  const normalizedId = stockId.trim().toUpperCase().replace(/\.(TW|TWO)$/u, "");
  return withCache(`major-holders:tdcc-or-norway:v3:${normalizedId}`, 60 * 60 * 6, async () => {
    let records: MajorHolderRecord[] = [];

    try {
      const session = await fetchTdccLandingPage();
      const dates = extractAvailableDates(session.html).slice(0, 80);
      if (dates.length) {
        records = (await mapWithConcurrency(dates, 16, (date) => fetchTdccMajorHolderByDate(normalizedId, date, session)))
          .filter((record): record is MajorHolderRecord => record !== null);
      }
    } catch {
      records = [];
    }

    if (records.length < 8) {
      records = await fetchNorwayFallback(normalizedId);
    }

    if (!records.length) {
      throw new Error(`TDCC 與備援來源都找不到 ${normalizedId} 的千張大戶資料。`);
    }

    return {
      id: normalizedId,
      latest: records[0] ?? null,
      records,
      trend: calculateTrend(records),
      warnings: []
    };
  });
}
