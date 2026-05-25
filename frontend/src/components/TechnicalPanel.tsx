import type { TechnicalResponse } from "../types/api";
import { formatNumber } from "../utils/format";
import { Card } from "./Card";

type TechnicalPanelProps = {
  technical?: TechnicalResponse;
};

export function TechnicalPanel({ technical }: TechnicalPanelProps) {
  const maItems = technical
    ? [
        ["MA5", technical.ma.ma5.at(-1)?.value],
        ["MA10", technical.ma.ma10.at(-1)?.value],
        ["MA20", technical.ma.ma20.at(-1)?.value],
        ["MA60", technical.ma.ma60.at(-1)?.value]
      ]
    : [];

  return (
    <Card title="技術指標">
      <div className="grid grid-cols-2 gap-3">
        {maItems.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-ink-800/80 p-3">
            <p className="text-xs text-slate-400">{label}</p>
            <p className="mt-2 text-lg font-semibold tabular-nums text-white">
              {typeof value === "number" ? formatNumber(value, { maximumFractionDigits: 2 }) : "--"}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">
        MA 與成交量均線由後端依 TWSE STOCK_DAY 日 K 自行計算；資料不足時留空，不以 0 代替。
      </p>
    </Card>
  );
}
