import { useMemo } from "react";
import type { Candle, InstitutionalResponse, MajorHoldersResponse } from "../types/api";
import { alignInstitutionalFlows, alignMajorHolders, type KPeriod } from "../utils/chartData";
import { BarSubChart, InstitutionalFlowChart, type BarPoint, type FlowPoint } from "./BarSubChart";

type SubChartsProps = {
  candles: Candle[];
  period: KPeriod;
  institutional?: InstitutionalResponse;
  majorHolders?: MajorHoldersResponse;
};

export function SubCharts({ candles, period, institutional, majorHolders }: SubChartsProps) {
  const institutionalBars = useMemo<FlowPoint[]>(
    () => alignInstitutionalFlows(candles, institutional?.records ?? [], period),
    [candles, institutional?.records, period]
  );

  const majorHolderBars = useMemo<BarPoint[]>(
    () => alignMajorHolders(candles, majorHolders?.records ?? [], period),
    [candles, majorHolders?.records, period]
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InstitutionalFlowChart data={institutionalBars} emptyText="尚無外資與投信買賣超資料" />
      <BarSubChart
        title="千張大戶持股"
        data={majorHolderBars}
        emptyText="尚無千張大戶持股資料"
        precision={2}
        unit="%"
      />
    </div>
  );
}
