import { useEffect, useMemo, useRef } from "react";
import {
  ColorType,
  createChart,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type Time
} from "lightweight-charts";
import { Card } from "./Card";

export type BarPoint = {
  time: string;
  value: number;
};

export type FlowPoint = {
  time: string;
  foreignInvestor: number;
  investmentTrust: number;
};

type BarSubChartProps = {
  title: string;
  data: BarPoint[];
  emptyText: string;
  height?: number;
  precision?: number;
  unit?: string;
};

type InstitutionalFlowChartProps = {
  data: FlowPoint[];
  emptyText: string;
  height?: number;
};

function createBaseChart(container: HTMLDivElement, height: number): IChartApi {
  return createChart(container, {
    autoSize: true,
    height,
    layout: {
      background: { type: ColorType.Solid, color: "#101729" },
      textColor: "#94A3B8"
    },
    grid: {
      vertLines: { color: "rgba(148, 163, 184, 0.08)" },
      horzLines: { color: "rgba(148, 163, 184, 0.08)" }
    },
    rightPriceScale: {
      borderColor: "rgba(148, 163, 184, 0.16)"
    },
    timeScale: {
      borderColor: "rgba(148, 163, 184, 0.16)",
      timeVisible: false
    }
  });
}

export function BarSubChart({
  title,
  data,
  emptyText,
  height = 220,
  precision = 0,
  unit
}: BarSubChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Histogram", Time> | null>(null);

  const chartData = useMemo(
    () =>
      data.map((point) => ({
        time: point.time as Time,
        value: point.value,
        color: point.value >= 0 ? "rgba(0, 192, 135, 0.72)" : "rgba(255, 77, 103, 0.72)"
      })),
    [data]
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createBaseChart(containerRef.current, height);
    const series = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: "custom",
        minMove: 10 ** -precision,
        formatter: (value: number) => `${value.toFixed(precision)}${unit ? ` ${unit}` : ""}`
      },
      priceLineVisible: false,
      lastValueVisible: false
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height, precision, unit]);

  useEffect(() => {
    seriesRef.current?.setData(chartData);
    chartRef.current?.timeScale().fitContent();
  }, [chartData]);

  return (
    <Card title={title} action={unit ? <span className="text-xs text-slate-500">單位：{unit}</span> : undefined}>
      {data.length ? (
        <div ref={containerRef} style={{ height }} className="w-full" />
      ) : (
        <div className="flex h-[220px] items-center justify-center text-sm text-slate-500">{emptyText}</div>
      )}
    </Card>
  );
}

export function InstitutionalFlowChart({ data, emptyText, height = 220 }: InstitutionalFlowChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const foreignSeriesRef = useRef<ISeriesApi<"Histogram", Time> | null>(null);
  const trustSeriesRef = useRef<ISeriesApi<"Histogram", Time> | null>(null);

  const foreignData = useMemo(
    () =>
      data.map((point) => ({
        time: point.time as Time,
        value: point.foreignInvestor,
        color: point.foreignInvestor >= 0 ? "rgba(56, 189, 248, 0.7)" : "rgba(248, 113, 113, 0.7)"
      })),
    [data]
  );
  const trustData = useMemo(
    () =>
      data.map((point) => ({
        time: point.time as Time,
        value: point.investmentTrust,
        color: point.investmentTrust >= 0 ? "rgba(34, 197, 94, 0.72)" : "rgba(251, 146, 60, 0.72)"
      })),
    [data]
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createBaseChart(containerRef.current, height);
    const priceFormat = {
      type: "custom" as const,
      minMove: 1,
      formatter: (value: number) => `${value.toFixed(0)} 張`
    };
    const foreignSeries = chart.addSeries(HistogramSeries, {
      priceFormat,
      priceLineVisible: false,
      lastValueVisible: false
    });
    const trustSeries = chart.addSeries(HistogramSeries, {
      priceFormat,
      priceLineVisible: false,
      lastValueVisible: false
    });

    chartRef.current = chart;
    foreignSeriesRef.current = foreignSeries;
    trustSeriesRef.current = trustSeries;

    return () => {
      chart.remove();
      chartRef.current = null;
      foreignSeriesRef.current = null;
      trustSeriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    foreignSeriesRef.current?.setData(foreignData);
    trustSeriesRef.current?.setData(trustData);
    chartRef.current?.timeScale().fitContent();
  }, [foreignData, trustData]);

  return (
    <Card
      title="外資 / 投信每日買賣超"
      action={
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="text-sky-300">外資</span>
          <span className="text-emerald-300">投信</span>
          <span className="text-slate-500">單位：張</span>
        </div>
      }
    >
      {data.length ? (
        <div ref={containerRef} style={{ height }} className="w-full" />
      ) : (
        <div className="flex h-[220px] items-center justify-center text-sm text-slate-500">{emptyText}</div>
      )}
    </Card>
  );
}
