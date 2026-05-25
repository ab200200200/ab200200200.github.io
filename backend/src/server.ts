import "dotenv/config";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiRouter } from "./routes/api.js";
import { initPostgresSchema } from "./services/postgres.js";
import { runBootSyncIfNeeded, startDataSchedulers } from "./services/scheduler.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = [
  path.resolve(process.cwd(), "frontend", "dist"),
  path.resolve(currentDir, "..", "..", "frontend", "dist")
].find((candidate) => existsSync(path.join(candidate, "index.html")));

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? true }));
app.use(express.json());
app.use(morgan("dev"));
app.use(
  "/api",
  rateLimit({
    windowMs: 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "API request rate limit exceeded. Please retry later." }
  })
);

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "stock-platform-backend" });
});

app.use("/api", apiRouter);

if (frontendDist) {
  app.use(express.static(frontendDist));
  app.get(/^\/(?!api\/?).*/u, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  const status = message.includes("股票代號") ? 400 : 502;
  res.status(status).json({ error: message });
};

app.use(errorHandler);

async function bootstrap() {
  try {
    await initPostgresSchema();
    startDataSchedulers();
    await runBootSyncIfNeeded();
  } catch (error) {
    console.error("[bootstrap] initialization failed:", error);
  }

  app.listen(port, () => {
    console.log(`Stock platform server listening on http://localhost:${port}`);
    if (frontendDist) {
      console.log(`Serving frontend from ${frontendDist}`);
    }
  });
}

void bootstrap();
