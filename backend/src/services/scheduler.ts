import cron from "node-cron";
import { hasPostgres } from "./postgres.js";
import { runDailyMarketSync, runWeeklyMajorHolderSync, syncUniverse } from "./dataSync.js";

const TIMEZONE = process.env.SYNC_TIMEZONE ?? "Asia/Taipei";

export function startDataSchedulers(): void {
  if (!hasPostgres()) {
    console.log("[sync] DATABASE_URL not set, skip schedulers.");
    return;
  }

  cron.schedule(
    "0 19 * * 1-5",
    async () => {
      console.log("[sync] Daily market sync started.");
      const result = await runDailyMarketSync();
      console.log(
        `[sync] Daily market sync done. total=${result.total} success=${result.success} failed=${result.failed}`
      );
    },
    { timezone: TIMEZONE, noOverlap: true, name: "daily-market-sync" }
  );

  cron.schedule(
    "0 9 * * 6",
    async () => {
      console.log("[sync] Weekly major holder sync started.");
      const result = await runWeeklyMajorHolderSync();
      console.log(
        `[sync] Weekly major holder sync done. total=${result.total} success=${result.success} failed=${result.failed}`
      );
    },
    { timezone: TIMEZONE, noOverlap: true, name: "weekly-major-holder-sync" }
  );

  cron.schedule(
    "0 7 * * 1",
    async () => {
      const count = await syncUniverse();
      console.log(`[sync] Universe refresh done. symbols=${count}`);
    },
    { timezone: TIMEZONE, noOverlap: true, name: "weekly-universe-refresh" }
  );

  console.log(
    `[sync] Schedulers enabled (${TIMEZONE}): weekdays 19:00 for K/volume/institutional, Saturday 09:00 for major holders.`
  );
}

export async function runBootSyncIfNeeded(): Promise<void> {
  if (!hasPostgres()) return;
  if (process.env.RUN_SYNC_ON_BOOT !== "true") return;

  try {
    console.log("[sync] Boot sync enabled, refreshing universe and today's market data.");
    await syncUniverse();
    await runDailyMarketSync();
  } catch (error) {
    console.error("[sync] Boot sync failed:", error);
  }
}
