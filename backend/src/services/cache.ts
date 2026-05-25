import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.resolve(dirname, "../../data/cache.sqlite");
mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS api_cache (
    cache_key TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

type CacheRow = {
  payload: string;
  expires_at: number;
};

const getStatement = db.prepare("SELECT payload, expires_at FROM api_cache WHERE cache_key = ?");
const deleteStatement = db.prepare("DELETE FROM api_cache WHERE cache_key = ?");
const setStatement = db.prepare(`
  INSERT INTO api_cache (cache_key, payload, expires_at, created_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(cache_key) DO UPDATE SET
    payload = excluded.payload,
    expires_at = excluded.expires_at,
    created_at = excluded.created_at
`);
const pruneStatement = db.prepare("DELETE FROM api_cache WHERE expires_at <= ?");
const inflight = new Map<string, Promise<unknown>>();
let lastPruneAt = 0;

function maybePruneExpired(now: number): void {
  // 最多每 10 分鐘清一次過期快取，避免 DB 無限成長
  if (now - lastPruneAt < 10 * 60 * 1000) return;
  pruneStatement.run(now);
  lastPruneAt = now;
}

export function getCached<T>(key: string): T | null {
  const row = getStatement.get(key) as CacheRow | undefined;
  if (!row) return null;

  if (row.expires_at <= Date.now()) {
    deleteStatement.run(key);
    return null;
  }

  return JSON.parse(row.payload) as T;
}

export function setCached<T>(key: string, value: T, ttlSeconds: number): T {
  const now = Date.now();
  setStatement.run(key, JSON.stringify(value), now + ttlSeconds * 1000, now);
  return value;
}

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  maybePruneExpired(now);

  const cached = getCached<T>(key);
  if (cached) return cached;

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const task = (async () => {
    try {
      const fresh = await fetcher();
      return setCached(key, fresh, ttlSeconds);
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}
