import clsx from "clsx";
import type { StockSummary } from "../types/api";
import { formatDateTime, formatIsoDate, formatNumber, formatSigned, formatTradingVolume } from "../utils/format";
import { MetricCard } from "./MetricCard";

type StockHeaderProps = {
  stock: StockSummary;
};

export function StockHeader({ stock }: StockHeaderProps) {
  const isUp = stock.change >= 0;
  const latestDate = formatIsoDate(stock.dataQuality.latestDate);

  return (
    <div className="grid gap-2 xl:grid-cols-[1.15fr_2fr]">
      <section className="rounded-lg border border-white/10 bg-ink-850/80 p-3 shadow-glow">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-slate-400">
              {stock.symbol} · {stock.exchange}
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-normal text-white">{stock.name}</h1>
          </div>
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-300">
            {stock.currency}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-end gap-2">
          <span className="text-3xl font-semibold leading-none tabular-nums text-white">
            {formatNumber(stock.price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className={clsx("pb-0.5 text-xl font-semibold tabular-nums", isUp ? "text-bull" : "text-bear")}>
            {formatSigned(stock.change, 2)} ({formatSigned(stock.changePercent, 2)}%)
          </span>
        </div>

        <p className="mt-2 text-[10px] text-slate-500">
          最新交易日 {latestDate} · 收盤時間 {formatDateTime(stock.marketTime)}
        </p>
      </section>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2">
        <MetricCard
          label="最近收盤價"
          value={formatNumber(stock.price, { maximumFractionDigits: 2 })}
          tone={isUp ? "up" : "down"}
        />
        <MetricCard
          label="漲跌"
          value={formatSigned(stock.change, 2)}
          subValue={`${formatSigned(stock.changePercent, 2)}%`}
          tone={isUp ? "up" : "down"}
        />
        <MetricCard label="最近交易日成交量" value={formatTradingVolume(stock.volume)} subValue={latestDate} />
        <MetricCard label="昨收" value={formatNumber(stock.previousClose, { maximumFractionDigits: 2 })} />
      </div>
    </div>
  );
}
