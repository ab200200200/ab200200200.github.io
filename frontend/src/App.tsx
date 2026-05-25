import { useEffect, useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { CandlestickChart } from "./components/CandlestickChart";
import { DataWarnings } from "./components/DataWarnings";
import { ErrorState, InlineLoading, LoadingState } from "./components/StateViews";
import { InstitutionalPanel } from "./components/InstitutionalPanel";
import { MajorHoldersPanel } from "./components/MajorHoldersPanel";
import { StockHeader } from "./components/StockHeader";
import { StockSearch } from "./components/StockSearch";
import { TechnicalPanel } from "./components/TechnicalPanel";
import { VolumePanel } from "./components/VolumePanel";
import { useStockDashboard, useStockSummary } from "./hooks/useStockDashboard";
import { aggregateCandles, limitVisibleCandles, type KPeriod } from "./utils/chartData";

type RecentSearchItem = {
  symbol: string;
  name: string;
};

const RECENT_SEARCHES_KEY = "stock-platform:recent-searches";

function loadRecentSearches(): RecentSearchItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentSearchItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => typeof item?.symbol === "string" && typeof item?.name === "string")
      .slice(0, 10);
  } catch {
    return [];
  }
}

function saveRecentSearches(items: RecentSearchItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items.slice(0, 10)));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "資料載入失敗，請稍後再試。";
}

export default function App() {
  const [stockId, setStockId] = useState("2330");
  const [kPeriod, setKPeriod] = useState<KPeriod>("daily");
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>(() => loadRecentSearches());
  const stockQuery = useStockSummary(stockId);
  const [technicalQuery, institutionalQuery, majorHoldersQuery] = useStockDashboard(stockId);

  useEffect(() => {
    const stock = stockQuery.data;
    if (!stock) return;

    const symbol = stock.symbol?.trim() || stock.id.trim().toUpperCase();
    const name = stock.name?.trim() || symbol;
    setRecentSearches((previous) => {
      const merged = [{ symbol, name }, ...previous.filter((item) => item.symbol !== symbol)].slice(0, 10);
      saveRecentSearches(merged);
      return merged;
    });
  }, [stockQuery.data]);

  const firstError = useMemo(
    () =>
      stockQuery.error ??
      technicalQuery.error ??
      institutionalQuery.error ??
      majorHoldersQuery.error,
    [institutionalQuery.error, majorHoldersQuery.error, stockQuery.error, technicalQuery.error]
  );

  const dataWarnings = useMemo(
    () => [
      ...(stockQuery.data?.warnings ?? []),
      ...(technicalQuery.data?.warnings ?? []),
      ...(institutionalQuery.data?.warnings ?? []),
      ...(majorHoldersQuery.data?.warnings ?? [])
    ],
    [institutionalQuery.data, majorHoldersQuery.data, stockQuery.data, technicalQuery.data]
  );

  const periodCandles = useMemo(
    () => aggregateCandles(stockQuery.data?.candles ?? [], kPeriod),
    [kPeriod, stockQuery.data?.candles]
  );
  const visibleCandles = useMemo(() => limitVisibleCandles(periodCandles, 80), [periodCandles]);
  const chartSourceCandles = useMemo(() => limitVisibleCandles(periodCandles, 180), [periodCandles]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-5 px-4 py-5 md:px-6 lg:px-8">
      <header className="flex flex-col gap-4 rounded-lg border border-white/10 bg-ink-900/80 p-4 shadow-glow">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-bull/15 p-2 text-bull">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Taiwan Market Terminal</p>
              <h1 className="text-2xl font-bold text-white">台股技術分析平台</h1>
            </div>
          </div>
          {(technicalQuery.isFetching || institutionalQuery.isFetching || majorHoldersQuery.isFetching) && (
            <InlineLoading label="更新資料中" />
          )}
        </div>
        <StockSearch initialValue={stockId} onSearch={setStockId} recentSearches={recentSearches} />
      </header>

      {firstError ? <ErrorState message={getErrorMessage(firstError)} /> : null}

      {stockQuery.isLoading ? (
        <LoadingState />
      ) : stockQuery.data ? (
        <>
          <StockHeader stock={stockQuery.data} />
          <DataWarnings warnings={dataWarnings} />

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid content-start gap-4">
              <CandlestickChart
                candles={visibleCandles}
                sourceCandles={chartSourceCandles}
                stock={stockQuery.data}
                period={kPeriod}
                institutional={institutionalQuery.data}
                majorHolders={majorHoldersQuery.data}
                onPeriodChange={setKPeriod}
              />
            </div>
            <div className="grid content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
              <TechnicalPanel technical={technicalQuery.data} />
              <VolumePanel technical={technicalQuery.data} latestDate={stockQuery.data.dataQuality.latestDate} />
              <InstitutionalPanel data={institutionalQuery.data} />
              <MajorHoldersPanel data={majorHoldersQuery.data} />
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
