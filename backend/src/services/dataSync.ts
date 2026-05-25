import { upsertCandles, upsertInstitutional, upsertMajorHolders, upsertStockUniverse, listActiveSymbols, insertSyncRun, finishSyncRun } from "./marketDataStore.js";
import { hasPostgres } from "./postgres.js";
import { fetchStockUniverse } from "./stockUniverse.js";
import { fetchMajorHolders } from "./tdcc.js";
import { fetchInstitutional } from "./twse.js";
import { fetchOpenApiStockSummary } from "./twseOpenApi.js";

const DEFAULT_CONCURRENCY = Number(process.env.DB_SYNC_CONCURRENCY ?? 6);

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<void>
): Promise<void> {
  if (!items.length) return;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      await mapper(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

async function resolveSyncSymbols(): Promise<string[]> {
  const inDatabase = await listActiveSymbols();
  if (inDatabase.length) return inDatabase;

  const universe = await fetchStockUniverse();
  if (universe.length) {
    await upsertStockUniverse(universe);
  }
  return universe.map((item) => item.symbol);
}

export async function syncUniverse(): Promise<number> {
  if (!hasPostgres()) return 0;
  const universe = await fetchStockUniverse();
  await upsertStockUniverse(universe);
  return universe.length;
}

export async function syncSymbolDailyData(symbol: string): Promise<void> {
  const stock = await fetchOpenApiStockSummary(symbol, { preferDatabase: false });
  await upsertCandles(symbol, stock.candles);

  const institutional = await fetchInstitutional(symbol, { preferDatabase: false });
  await upsertInstitutional(symbol, institutional.records);
}

export async function syncSymbolMajorHolders(symbol: string): Promise<void> {
  const majorHolders = await fetchMajorHolders(symbol, { preferDatabase: false });
  await upsertMajorHolders(symbol, majorHolders.records);
}

export async function runDailyMarketSync(): Promise<{ total: number; success: number; failed: number }> {
  if (!hasPostgres()) return { total: 0, success: 0, failed: 0 };
  const runId = await insertSyncRun("daily-market-sync", "running");
  try {
    await syncUniverse();
    const symbols = unique(await resolveSyncSymbols());
    let success = 0;
    let failed = 0;

    await mapWithConcurrency(symbols, DEFAULT_CONCURRENCY, async (symbol) => {
      try {
        await syncSymbolDailyData(symbol);
        success += 1;
      } catch {
        failed += 1;
      }
    });

    await finishSyncRun(runId, "success", `total=${symbols.length},success=${success},failed=${failed}`);
    return { total: symbols.length, success, failed };
  } catch (error) {
    await finishSyncRun(runId, "failed", error instanceof Error ? error.message : "unknown error");
    throw error;
  }
}

export async function runWeeklyMajorHolderSync(): Promise<{ total: number; success: number; failed: number }> {
  if (!hasPostgres()) return { total: 0, success: 0, failed: 0 };
  const runId = await insertSyncRun("weekly-major-holder-sync", "running");
  try {
    await syncUniverse();
    const symbols = unique(await resolveSyncSymbols());
    let success = 0;
    let failed = 0;

    await mapWithConcurrency(symbols, Math.max(1, Math.floor(DEFAULT_CONCURRENCY / 2)), async (symbol) => {
      try {
        await syncSymbolMajorHolders(symbol);
        success += 1;
      } catch {
        failed += 1;
      }
    });

    await finishSyncRun(runId, "success", `total=${symbols.length},success=${success},failed=${failed}`);
    return { total: symbols.length, success, failed };
  } catch (error) {
    await finishSyncRun(runId, "failed", error instanceof Error ? error.message : "unknown error");
    throw error;
  }
}
