import clsx from "clsx";
import type { InstitutionalResponse } from "../types/api";
import { formatSigned, formatVolume } from "../utils/format";
import { Card } from "./Card";

type InstitutionalPanelProps = {
  data?: InstitutionalResponse;
};

function FlowRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-ink-800/80 px-3 py-2">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={clsx("font-semibold tabular-nums", value >= 0 ? "text-bull" : "text-bear")}>
        {formatSigned(value)}
      </span>
    </div>
  );
}

export function InstitutionalPanel({ data }: InstitutionalPanelProps) {
  const latest = data?.latest;

  return (
    <Card title="三大法人">
      {latest ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>最新資料日</span>
            <span>{latest.date}</span>
          </div>
          <FlowRow label="外資買賣超" value={latest.foreignInvestor} />
          <FlowRow label="投信買賣超" value={latest.investmentTrust} />
          <FlowRow label="自營商買賣超" value={latest.dealer} />
          <div className="rounded-lg border border-white/10 p-3">
            <p className="text-xs text-slate-400">三大法人合計</p>
            <p className={clsx("mt-2 text-xl font-semibold tabular-nums", latest.total >= 0 ? "text-bull" : "text-bear")}>
              {formatVolume(latest.total)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {data.streak.direction === "buy"
                ? `連續買超 ${data.streak.buyDays} 天`
                : data.streak.direction === "sell"
                  ? `連續賣超 ${data.streak.sellDays} 天`
                  : "買賣超持平"}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">目前查無法人資料。</p>
          {data?.warnings.map((warning) => (
            <p key={warning} className="text-xs leading-5 text-amber-200/80">{warning}</p>
          ))}
        </div>
      )}
    </Card>
  );
}
