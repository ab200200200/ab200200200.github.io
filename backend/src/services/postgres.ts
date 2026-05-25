import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";

const shouldEnablePostgres = Boolean(databaseUrl);
const useSsl = shouldEnablePostgres && !/localhost|127\.0\.0\.1/iu.test(databaseUrl);

const pool = shouldEnablePostgres
  ? new Pool({
      connectionString: databaseUrl,
      max: Number(process.env.PG_POOL_MAX ?? 12),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined
    })
  : null;

export function hasPostgres(): boolean {
  return pool !== null;
}

export async function pgQuery<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }
  return pool.query<T>(sql, params);
}

export async function withPgClient<T>(runner: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }
  const client = await pool.connect();
  try {
    return await runner(client);
  } finally {
    client.release();
  }
}

export async function initPostgresSchema(): Promise<void> {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_symbols (
      symbol TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      market TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS stock_prices_daily (
      symbol TEXT NOT NULL,
      trade_date DATE NOT NULL,
      open NUMERIC(14, 4) NOT NULL,
      high NUMERIC(14, 4) NOT NULL,
      low NUMERIC(14, 4) NOT NULL,
      close NUMERIC(14, 4) NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (symbol, trade_date)
    );

    CREATE TABLE IF NOT EXISTS stock_volumes_daily (
      symbol TEXT NOT NULL,
      trade_date DATE NOT NULL,
      volume BIGINT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (symbol, trade_date)
    );

    CREATE TABLE IF NOT EXISTS institutional_foreign_daily (
      symbol TEXT NOT NULL,
      trade_date DATE NOT NULL,
      net_buy_sell BIGINT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (symbol, trade_date)
    );

    CREATE TABLE IF NOT EXISTS institutional_trust_daily (
      symbol TEXT NOT NULL,
      trade_date DATE NOT NULL,
      net_buy_sell BIGINT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (symbol, trade_date)
    );

    CREATE TABLE IF NOT EXISTS major_holders_weekly (
      symbol TEXT NOT NULL,
      report_date DATE NOT NULL,
      percentage NUMERIC(8, 4) NOT NULL,
      shares BIGINT NOT NULL,
      holders INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (symbol, report_date)
    );

    CREATE TABLE IF NOT EXISTS data_sync_runs (
      id BIGSERIAL PRIMARY KEY,
      job_name TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ NULL,
      note TEXT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_stock_prices_daily_symbol_date_desc
      ON stock_prices_daily (symbol, trade_date DESC);

    CREATE INDEX IF NOT EXISTS idx_stock_volumes_daily_symbol_date_desc
      ON stock_volumes_daily (symbol, trade_date DESC);

    CREATE INDEX IF NOT EXISTS idx_institutional_foreign_symbol_date_desc
      ON institutional_foreign_daily (symbol, trade_date DESC);

    CREATE INDEX IF NOT EXISTS idx_institutional_trust_symbol_date_desc
      ON institutional_trust_daily (symbol, trade_date DESC);

    CREATE INDEX IF NOT EXISTS idx_major_holders_weekly_symbol_date_desc
      ON major_holders_weekly (symbol, report_date DESC);
  `);
}

export async function closePostgres(): Promise<void> {
  if (!pool) return;
  await pool.end();
}
