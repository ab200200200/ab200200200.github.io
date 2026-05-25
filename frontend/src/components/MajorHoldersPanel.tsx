import clsx from "clsx";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { MajorHoldersResponse } from "../types/api";
import { formatNumber, formatSigned } from "../utils/format";
import { Card } from "./Card";

type MajorHoldersPanelProps = {
  data?: MajorHoldersResponse;
};

export function MajorHoldersPanel({ data }: MajorHoldersPanelProps) {
  const latest = data?.latest;
  const isUp = data?.trend.direction === "up";

  return (
    <Card title="千張大戶持股">
      {latest ? (
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-400">千張以上持股比例</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-white">
                {formatNumber(latest.percentage, { maximumFractionDigits: 2 })}%
              </p>
              <p className="mt-1 text-xs text-slate-500">{latest.date}</p>
            </div>
            <div className={clsx("rounded-lg p-2", isUp ? "bg-bull/10 text-bull" : "bg-bear/10 text-bear")}>
              {isUp ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-ink-800/80 p-3">
              <p className="text-xs text-slate-400">週變化</p>
              <p className={clsx("mt-2 font-semibold tabular-nums", (data?.trend.weeklyChange ?? 0) >= 0 ? "text-bull" : "text-bear")}>
                {formatSigned(data?.trend.weeklyChange ?? 0, 2)}%
              </p>
            </div>
            <div className="rounded-lg bg-ink-800/80 p-3">
              <p className="text-xs text-slate-400">近 4 週</p>
              <p className={clsx("mt-2 font-semibold tabular-nums", (data?.trend.fourWeekChange ?? 0) >= 0 ? "text-bull" : "text-bear")}>
                {formatSigned(data?.trend.fourWeekChange ?? 0, 2)}%
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {data?.records.slice(0, 5).map((record) => (
              <div key={record.date} className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{record.date}</span>
                <span className="tabular-nums text-slate-200">{record.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">目前查無千張大戶資料。</p>
      )}
    </Card>
  );
}
