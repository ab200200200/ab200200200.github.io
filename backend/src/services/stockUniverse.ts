import { withCache } from "./cache.js";
import { http } from "./http.js";

export type StockSymbolInfo = {
  symbol: string;
  name: string;
  market: "TWSE" | "TPEX";
};

const UNIVERSE_ENDPOINTS: Array<{ url: string; market: "TWSE" | "TPEX" }> = [
  { url: "https://openapi.twse.com.tw/v1/opendata/t187ap03_L", market: "TWSE" },
  { url: "https://openapi.twse.com.tw/v1/opendata/t187ap03_O", market: "TPEX" },
  { url: "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O", market: "TPEX" }
];

const CODE_KEYS = ["公司代號", "證券代號", "股票代號", "有價證券代號", "Code", "stockNo"];
const NAME_KEYS = ["公司名稱", "公司簡稱", "證券名稱", "股票名稱", "CompanyName", "Name"];

function pickValue(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeName(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function isStockSymbol(value: string): boolean {
  return /^[0-9A-Z]{2,10}$/u.test(value);
}

async function fetchUniverseByEndpoint(url: string, market: "TWSE" | "TPEX"): Promise<StockSymbolInfo[]> {
  const response = await http.get<unknown>(url, { timeout: 10_000 });
  if (!Array.isArray(response.data)) return [];

  return response.data
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((record) => {
      const symbol = normalizeSymbol(pickValue(record, CODE_KEYS));
      const name = normalizeName(pickValue(record, NAME_KEYS));
      return { symbol, name, market };
    })
    .filter((item) => isStockSymbol(item.symbol) && Boolean(item.name));
}

export async function fetchStockUniverse(): Promise<StockSymbolInfo[]> {
  return withCache("stock-universe:v1", 60 * 60 * 6, async () => {
    const results = await Promise.allSettled(
      UNIVERSE_ENDPOINTS.map((endpoint) => fetchUniverseByEndpoint(endpoint.url, endpoint.market))
    );
    const merged = new Map<string, StockSymbolInfo>();

    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const symbolInfo of result.value) {
        if (!merged.has(symbolInfo.symbol)) {
          merged.set(symbolInfo.symbol, symbolInfo);
        }
      }
    }

    return [...merged.values()].sort((left, right) => left.symbol.localeCompare(right.symbol));
  });
}
