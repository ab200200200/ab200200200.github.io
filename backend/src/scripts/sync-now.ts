import "dotenv/config";
import { initPostgresSchema } from "../services/postgres.js";
import { runDailyMarketSync, runWeeklyMajorHolderSync, syncUniverse } from "../services/dataSync.js";

async function main() {
  const mode = (process.argv[2] ?? "daily").toLowerCase();
  await initPostgresSchema();

  if (mode === "universe") {
    const count = await syncUniverse();
    console.log(`Universe synced: ${count} symbols`);
    return;
  }

  if (mode === "major") {
    const result = await runWeeklyMajorHolderSync();
    console.log("Weekly major holder sync:", result);
    return;
  }

  const result = await runDailyMarketSync();
  console.log("Daily market sync:", result);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
