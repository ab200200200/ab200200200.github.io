import type { TechnicalResponse } from "../types/api";
import { formatIsoDate, formatNumber, formatTradingVolume } from "../utils/format";
import { Card } from "./Card";
import { MetricCard } from "./MetricCard";

type VolumePanelProps = {
  technical?: TechnicalResponse;
  latestDate?: string | null;
};

export function VolumePanel({ technical, latestDate }: VolumePanelProps) {
  const volume = technical?.volume;
  const hasAverage5 = typeof volume?.average5 === "number";
  const hasSpikeRatio = typeof volume?.spikeRatio === "number";
  const displayDate = formatIsoDate(latestDate);

  return (
    <Card title="成交量分析">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
        <MetricCard label="最近交易日成交量" value={formatTradingVolume(volume?.todayVolume ?? 0)} subValue={displayDate} />
        <MetricCard
          label="5 日均量"
          value={hasAverage5 ? formatTradingVolume(volume?.average5 ?? 0) : "--"}
          subValue={hasAverage5 ? undefined : "日 K 少於 5 根，無法計算 5 日均量"}
        />
        <MetricCard
          label="是否爆量"
          value={
            volume?.isVolumeSpike === null || volume?.isVolumeSpike === undefined
              ? "--"
              : volume.isVolumeSpike
                ? "爆量"
                : "正常"
          }
          subValue={hasSpikeRatio ? `量比 ${formatNumber(volume?.spikeRatio ?? 0, { maximumFractionDigits: 2 })}x` : "缺少 5 日均量"}
          tone={volume?.isVolumeSpike ? "warning" : "neutral"}
        />
      </div>
    </Card>
  );
}
