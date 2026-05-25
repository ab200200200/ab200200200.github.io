import type { Candle, InstitutionalRecord, MajorHolderRecord } from "../types.js";
import { hasPostgres, pgQuery, withPgClient } from "./postgres.js";
import type { StockSymbolInfo } from "./stockUniverse.js";

const UPSERT_CHUNK_SIZE = 400;
const DAILY_ROWS_TO_KEEP = Number(process.env.DAILY_ROWS_TO_KEEP ?? 400);
const WEEKLY_ROWS_TO_KEEP = Number(process.env.WEEKLY_ROWS_TO_KEEP ?? 160);

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

async function pruneByDateLimit(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  tableName: string,
  symbol: string,
  dateColumn: string,
  keepRows: number
): Promise<void> {
  const safeKeep = Math.max(120, keepRows);
  await client.query(
    `
    DELETE FROM ${tableName}
    WHERE symbol = $1
      AND ${dateColumn} < COALESCE(
        (
          SELECT ${dateColumn}
          FROM ${tableName}
          WHERE symbol = $1
          ORDER BY ${dateColumn} DESC
          OFFSET $2
          LIMIT 1
        ),
        DATE '1900-01-01'
      )
    `,
    [symbol, safeKeep]
  );
}

type StoredCandle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type StoredInstitutional = {
  date: string;
  foreignInvestor: number;
  investmentTrust: number;
};

type StoredMajorHolder = {
  date: string;
  percentage: number;
  shares: number;
  holders: number;
};

export async function upsertStockUniverse(symbols: StockSymbolInfo[]): Promise<void> {
  if (!hasPostgres() || !symbols.length) return;

  await withPgClient(async (client) => {
    await client.query("BEGIN");
    try {
      for (const chunk of chunkArray(symbols, UPSERT_CHUNK_SIZE)) {
        const values: unknown[] = [];
        const placeholders = chunk.map((item, index) => {
          const base = index * 3;
          values.push(item.symbol, item.name, item.market);
          return `($${base + 1}, $${base + 2}, $${base + 3}, TRUE, NOW())`;
        });

        await client.query(
          `
          INSERT INTO stock_symbols (symbol, name, market, is_active, updated_at)
          VALUES ${placeholders.join(", ")}
          ON CONFLICT (symbol) DO UPDATE
            SET name = EXCLUDED.name,
                market = EXCLUDED.market,
                is_active = TRUE,
                updated_at = NOW()
          `,
          values
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function listActiveSymbols(): Promise<string[]> {
  if (!hasPostgres()) return [];
  const result = await pgQuery<{ symbol: string }>(
    `SELECT symbol FROM stock_symbols WHERE is_active = TRUE ORDER BY symbol ASC`
  );
  return result.rows.map((row: { symbol: string }) => row.symbol);
}

export async function upsertCandles(symbol: string, candles: Candle[]): Promise<void> {
  if (!hasPostgres() || !candles.length) return;
  const sanitized = candles
    .filter((item) => item.time && item.open > 0 && item.high > 0 && item.low > 0 && item.close > 0)
    .map((item) => ({
      time: item.time,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: Math.max(0, Math.floor(item.volume))
    }));

  if (!sanitized.length) return;

  await withPgClient(async (client) => {
    await client.query("BEGIN");
    try {
      for (const chunk of chunkArray(sanitized, UPSERT_CHUNK_SIZE)) {
        const values: unknown[] = [];
        const pricePlaceholders = chunk.map((item, index) => {
          const base = index * 6;
          values.push(symbol, item.time, item.open, item.high, item.low, item.close);
          return `($${base + 1}, $${base + 2}::date, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, NOW())`;
        });

        await client.query(
          `
          INSERT INTO stock_prices_daily (symbol, trade_date, open, high, low, close, updated_at)
          VALUES ${pricePlaceholders.join(", ")}
          ON CONFLICT (symbol, trade_date) DO UPDATE
            SET open = EXCLUDED.open,
                high = EXCLUDED.high,
                low = EXCLUDED.low,
                close = EXCLUDED.close,
                updated_at = NOW()
          `,
          values
        );
      }

      for (const chunk of chunkArray(sanitized, UPSERT_CHUNK_SIZE)) {
        const values: unknown[] = [];
        const volumePlaceholders = chunk.map((item, index) => {
          const base = index * 3;
          values.push(symbol, item.time, item.volume);
          return `($${base + 1}, $${base + 2}::date, $${base + 3}, NOW())`;
        });

        await client.query(
          `
          INSERT INTO stock_volumes_daily (symbol, trade_date, volume, updated_at)
          VALUES ${volumePlaceholders.join(", ")}
          ON CONFLICT (symbol, trade_date) DO UPDATE
            SET volume = EXCLUDED.volume,
                updated_at = NOW()
          `,
          values
        );
      }

      await pruneByDateLimit(client, "stock_prices_daily", symbol, "trade_date", DAILY_ROWS_TO_KEEP);
      await pruneByDateLimit(client, "stock_volumes_daily", symbol, "trade_date", DAILY_ROWS_TO_KEEP);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function loadCandles(symbol: string, limit = 220): Promise<StoredCandle[]> {
  if (!hasPostgres()) return [];

  const result = await pgQuery<{
    time: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }>(
    `
    SELECT
      p.trade_date::text AS time,
      p.open::text AS open,
      p.high::text AS high,
      p.low::text AS low,
      p.close::text AS close,
      COALESCE(v.volume, 0)::text AS volume
    FROM stock_prices_daily p
    LEFT JOIN stock_volumes_daily v
      ON v.symbol = p.symbol
     AND v.trade_date = p.trade_date
    WHERE p.symbol = $1
    ORDER BY p.trade_date DESC
    LIMIT $2
    `,
    [symbol, limit]
  );

  return result.rows
    .map((row: { time: string; open: string; high: string; low: string; close: string; volume: string }) => ({
      time: row.time,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume)
    }))
    .sort((left: StoredCandle, right: StoredCandle) => left.time.localeCompare(right.time));
}

export async function upsertInstitutional(symbol: string, records: InstitutionalRecord[]): Promise<void> {
  if (!hasPostgres() || !records.length) return;
  const sanitized = records.filter((item) => item.date);
  if (!sanitized.length) return;

  await withPgClient(async (client) => {
    await client.query("BEGIN");
    try {
      for (const chunk of chunkArray(sanitized, UPSERT_CHUNK_SIZE)) {
        const foreignValues: unknown[] = [];
        const foreignPlaceholders = chunk.map((item, index) => {
          const base = index * 3;
          foreignValues.push(symbol, item.date, Math.round(item.foreignInvestor));
          return `($${base + 1}, $${base + 2}::date, $${base + 3}, NOW())`;
        });

        await client.query(
          `
          INSERT INTO institutional_foreign_daily (symbol, trade_date, net_buy_sell, updated_at)
          VALUES ${foreignPlaceholders.join(", ")}
          ON CONFLICT (symbol, trade_date) DO UPDATE
            SET net_buy_sell = EXCLUDED.net_buy_sell,
                updated_at = NOW()
          `,
          foreignValues
        );
      }

      for (const chunk of chunkArray(sanitized, UPSERT_CHUNK_SIZE)) {
        const trustValues: unknown[] = [];
        const trustPlaceholders = chunk.map((item, index) => {
          const base = index * 3;
          trustValues.push(symbol, item.date, Math.round(item.investmentTrust));
          return `($${base + 1}, $${base + 2}::date, $${base + 3}, NOW())`;
        });

        await client.query(
          `
          INSERT INTO institutional_trust_daily (symbol, trade_date, net_buy_sell, updated_at)
          VALUES ${trustPlaceholders.join(", ")}
          ON CONFLICT (symbol, trade_date) DO UPDATE
            SET net_buy_sell = EXCLUDED.net_buy_sell,
                updated_at = NOW()
          `,
          trustValues
        );
      }
      await pruneByDateLimit(client, "institutional_foreign_daily", symbol, "trade_date", DAILY_ROWS_TO_KEEP);
      await pruneByDateLimit(client, "institutional_trust_daily", symbol, "trade_date", DAILY_ROWS_TO_KEEP);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function loadInstitutional(symbol: string, limit = 180): Promise<StoredInstitutional[]> {
  if (!hasPostgres()) return [];

  const result = await pgQuery<{
    date: string;
    foreign_investor: string;
    investment_trust: string;
  }>(
    `
    SELECT
      d.trade_date::text AS date,
      COALESCE(f.net_buy_sell, 0)::text AS foreign_investor,
      COALESCE(t.net_buy_sell, 0)::text AS investment_trust
    FROM (
      SELECT trade_date
      FROM institutional_foreign_daily
      WHERE symbol = $1
      UNION
      SELECT trade_date
      FROM institutional_trust_daily
      WHERE symbol = $1
    ) d
    LEFT JOIN institutional_foreign_daily f
      ON f.symbol = $1
     AND f.trade_date = d.trade_date
    LEFT JOIN institutional_trust_daily t
      ON t.symbol = $1
     AND t.trade_date = d.trade_date
    ORDER BY d.trade_date DESC
    LIMIT $2
    `,
    [symbol, limit]
  );

  return result.rows
    .map((row: { date: string; foreign_investor: string; investment_trust: string }) => ({
      date: row.date,
      foreignInvestor: Number(row.foreign_investor),
      investmentTrust: Number(row.investment_trust)
    }))
    .sort((left: StoredInstitutional, right: StoredInstitutional) => left.date.localeCompare(right.date));
}

export async function upsertMajorHolders(symbol: string, records: MajorHolderRecord[]): Promise<void> {
  if (!hasPostgres() || !records.length) return;
  const sanitized = records
    .filter((item) => item.date)
    .map((item) => ({
      date: item.date,
      percentage: item.percentage,
      shares: Math.max(0, Math.round(item.shares)),
      holders: Math.max(0, Math.round(item.holders))
    }));
  if (!sanitized.length) return;

  await withPgClient(async (client) => {
    await client.query("BEGIN");
    try {
      for (const chunk of chunkArray(sanitized, UPSERT_CHUNK_SIZE)) {
        const values: unknown[] = [];
        const placeholders = chunk.map((item, index) => {
          const base = index * 5;
          values.push(symbol, item.date, item.percentage, item.shares, item.holders);
          return `($${base + 1}, $${base + 2}::date, $${base + 3}, $${base + 4}, $${base + 5}, NOW())`;
        });

        await client.query(
          `
          INSERT INTO major_holders_weekly (symbol, report_date, percentage, shares, holders, updated_at)
          VALUES ${placeholders.join(", ")}
          ON CONFLICT (symbol, report_date) DO UPDATE
            SET percentage = EXCLUDED.percentage,
                shares = EXCLUDED.shares,
                holders = EXCLUDED.holders,
                updated_at = NOW()
          `,
          values
        );
      }
      await pruneByDateLimit(client, "major_holders_weekly", symbol, "report_date", WEEKLY_ROWS_TO_KEEP);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function loadMajorHolders(symbol: string, limit = 220): Promise<StoredMajorHolder[]> {
  if (!hasPostgres()) return [];
  const result = await pgQuery<{
    date: string;
    percentage: string;
    shares: string;
    holders: string;
  }>(
    `
    SELECT
      report_date::text AS date,
      percentage::text AS percentage,
      shares::text AS shares,
      holders::text AS holders
    FROM major_holders_weekly
    WHERE symbol = $1
    ORDER BY report_date DESC
    LIMIT $2
    `,
    [symbol, limit]
  );

  return result.rows
    .map((row: { date: string; percentage: string; shares: string; holders: string }) => ({
      date: row.date,
      percentage: Number(row.percentage),
      shares: Number(row.shares),
      holders: Number(row.holders)
    }))
    .sort((left: StoredMajorHolder, right: StoredMajorHolder) => left.date.localeCompare(right.date));
}

export async function insertSyncRun(jobName: string, status: "running" | "success" | "failed", note = ""): Promise<number> {
  if (!hasPostgres()) return 0;
  const result = await pgQuery<{ id: number }>(
    `
    INSERT INTO data_sync_runs (job_name, status, note, started_at, ended_at)
    VALUES ($1, $2, $3, NOW(), CASE WHEN $2 = 'running' THEN NULL ELSE NOW() END)
    RETURNING id
    `,
    [jobName, status, note || null]
  );
  return result.rows[0]?.id ?? 0;
}

export async function finishSyncRun(runId: number, status: "success" | "failed", note = ""): Promise<void> {
  if (!hasPostgres() || !runId) return;
  await pgQuery(
    `
    UPDATE data_sync_runs
    SET status = $2,
        note = $3,
        ended_at = NOW()
    WHERE id = $1
    `,
    [runId, status, note || null]
  );
}
