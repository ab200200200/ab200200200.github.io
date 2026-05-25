import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time
} from "lightweight-charts";
import clsx from "clsx";
import type { Candle, InstitutionalResponse, MajorHoldersResponse, MovingAverageSet, StockSummary } from "../types/api";
import {
  alignInstitutionalFlows,
  alignMajorHolders,
  getWeekKey,
  simpleMovingAverage,
  simpleVolumeMovingAverage,
  type KPeriod
} from "../utils/chartData";
import { formatNumber, formatSigned, formatTradingVolume } from "../utils/format";
import { Card } from "./Card";

type CandlestickChartProps = {
  candles: Candle[];
  sourceCandles: Candle[];
  stock: StockSummary;
  period: KPeriod;
  institutional?: InstitutionalResponse;
  majorHolders?: MajorHoldersResponse;
  onPeriodChange: (period: KPeriod) => void;
};

type QuoteData = {
  candle: Candle;
  change: number;
  changePercent: number;
  foreignInvestor: number;
  investmentTrust: number;
  majorHolder: number | null;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma60: number | null;
};

type LineSeriesRef = ISeriesApi<"Line", Time>;

type ValuePoint = {
  time: string;
  value: number;
};

type DrawAnchor = {
  time: string;
  value: number;
};

type DrawLine = {
  id: string;
  start: DrawAnchor;
  end: DrawAnchor;
  color: string;
};

const MA_KEYS = ["ma5", "ma10", "ma20", "ma60"] as const;
type MaKey = (typeof MA_KEYS)[number];

const MA_BUTTONS: { key: MaKey; label: string; colorClass: string }[] = [
  { key: "ma5", label: "MA5", colorClass: "text-slate-900" },
  { key: "ma10", label: "MA10", colorClass: "text-blue-600" },
  { key: "ma20", label: "MA20", colorClass: "text-red-500" },
  { key: "ma60", label: "MA60", colorClass: "text-orange-500" }
];

const DRAW_COLORS = {
  red: "#EF4444",
  blue: "#2563EB",
  green: "#16A34A"
} as const;

type DrawColorKey = keyof typeof DRAW_COLORS;
type DrawToolMode = "none" | "line";

function movingAverage(points: ValuePoint[], periodLength: number): ValuePoint[] {
  const result: ValuePoint[] = [];
  let rollingSum = 0;

  points.forEach((point, index) => {
    rollingSum += point.value;
    if (index >= periodLength) rollingSum -= points[index - periodLength].value;
    if (index >= periodLength - 1) {
      result.push({
        time: point.time,
        value: Math.round(rollingSum / periodLength)
      });
    }
  });

  return result;
}

function formatPrice(value: number): string {
  return formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDisplayDate(dateText: string): string {
  return dateText.replace(/-/g, "/");
}

function toDateKey(time: Time | null | undefined): string | null {
  if (!time) return null;
  if (typeof time === "string") return time;
  if (typeof time === "number") return null;
  if ("year" in time && "month" in time && "day" in time) {
    const y = String(time.year);
    const m = String(time.month).padStart(2, "0");
    const d = String(time.day).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return null;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function sortLineAnchors(left: DrawAnchor, right: DrawAnchor): [DrawAnchor, DrawAnchor] {
  return left.time <= right.time ? [left, right] : [right, left];
}

function getPaneLabel(period: KPeriod): string {
  return period === "daily" ? "日K" : "周K";
}

function getPeriodChartLabel(period: KPeriod): string {
  return period === "daily" ? "日線圖" : "周線圖";
}

function valueColor(value: number): string {
  return value >= 0 ? "text-red-600" : "text-emerald-700";
}

function formatNetLots(value: number): string {
  return `${formatSigned(value)} 張`;
}

function priceRelativeColor(value: number, reference: number): string {
  if (value > reference) return "text-red-600";
  if (value < reference) return "text-emerald-700";
  return "text-slate-900";
}

function SubPaneValue({
  label,
  value,
  valueClassName = "text-slate-900",
  className
}: {
  label: string;
  value: string;
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "w-fit rounded border border-slate-300 bg-white/92 px-2 py-1 text-[11px] font-semibold text-slate-950 shadow-sm",
        className ?? "ml-2 mt-2"
      )}
    >
      <span>{label} </span>
      <span className={valueClassName}>{value}</span>
    </div>
  );
}

export function CandlestickChart({
  candles,
  sourceCandles,
  stock,
  period,
  institutional,
  majorHolders,
  onPeriodChange
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram", Time> | null>(null);
  const volumeMaSeriesRef = useRef<LineSeriesRef | null>(null);
  const foreignSeriesRef = useRef<ISeriesApi<"Histogram", Time> | null>(null);
  const foreignLineRef = useRef<LineSeriesRef | null>(null);
  const trustSeriesRef = useRef<ISeriesApi<"Histogram", Time> | null>(null);
  const trustLineRef = useRef<LineSeriesRef | null>(null);
  const holdersSeriesRef = useRef<ISeriesApi<"Histogram", Time> | null>(null);
  const maSeriesRef = useRef<LineSeriesRef[]>([]);
  const drawingSeriesRef = useRef<LineSeriesRef[]>([]);
  const previewSeriesRef = useRef<LineSeriesRef | null>(null);
  const pendingDrawAnchorRef = useRef<DrawAnchor | null>(null);
  const drawLinesRef = useRef<DrawLine[]>([]);
  const lineModeRef = useRef(false);
  const drawColorRef = useRef<string>(DRAW_COLORS.blue);
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [drawToolMode, setDrawToolMode] = useState<DrawToolMode>("none");
  const [drawColorKey, setDrawColorKey] = useState<DrawColorKey>("blue");
  const [drawLines, setDrawLines] = useState<DrawLine[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [pendingDrawAnchor, setPendingDrawAnchor] = useState<DrawAnchor | null>(null);
  const [previewLineEnd, setPreviewLineEnd] = useState<DrawAnchor | null>(null);
  const [chartEpoch, setChartEpoch] = useState(0);
  const [maVisibility, setMaVisibility] = useState<Record<MaKey, boolean>>({
    ma5: true,
    ma10: true,
    ma20: true,
    ma60: true
  });

  const visibleTimes = useMemo(() => new Set(candles.map((candle) => candle.time)), [candles]);
  const sourceIndexByTime = useMemo(
    () => new Map(sourceCandles.map((candle, index) => [candle.time, index])),
    [sourceCandles]
  );
  const periodMa = useMemo<MovingAverageSet>(
    () => ({
      ma5: simpleMovingAverage(sourceCandles, 5),
      ma10: simpleMovingAverage(sourceCandles, 10),
      ma20: simpleMovingAverage(sourceCandles, 20),
      ma60: simpleMovingAverage(sourceCandles, 60)
    }),
    [sourceCandles]
  );

  const maByTime = useMemo(() => {
    const values = new Map<string, Partial<Pick<QuoteData, "ma5" | "ma10" | "ma20" | "ma60">>>();
    const add = (key: "ma5" | "ma10" | "ma20" | "ma60", points: { time: string; value: number }[]) => {
      for (const point of points) {
        values.set(point.time, { ...(values.get(point.time) ?? {}), [key]: point.value });
      }
    };

    add("ma5", periodMa.ma5);
    add("ma10", periodMa.ma10);
    add("ma20", periodMa.ma20);
    add("ma60", periodMa.ma60);
    return values;
  }, [periodMa]);

  const institutionalFlows = useMemo(
    () => alignInstitutionalFlows(candles, institutional?.records ?? [], period),
    [candles, institutional?.records, period]
  );
  const institutionalByTime = useMemo(
    () => new Map(institutionalFlows.map((point) => [point.time, point])),
    [institutionalFlows]
  );

  const majorHolderPoints = useMemo(
    () => alignMajorHolders(candles, majorHolders?.records ?? [], period),
    [candles, majorHolders?.records, period]
  );
  const majorHolderByTime = useMemo(
    () => new Map(majorHolderPoints.map((point) => [point.time, point])),
    [majorHolderPoints]
  );
  const majorHolderWeeklyDelta = useMemo(() => {
    const records = [...(majorHolders?.records ?? [])].sort((left, right) => left.date.localeCompare(right.date));
    const byWeek = new Map<string, number>();
    let previousValue: number | null = null;

    for (const record of records) {
      const weekKey = getWeekKey(record.date);
      byWeek.set(weekKey, previousValue === null ? 0 : record.percentage - previousValue);
      previousValue = record.percentage;
    }

    return byWeek;
  }, [majorHolders?.records]);

  const quoteByTime = useMemo(() => {
    const quotes = new Map<string, QuoteData>();
    for (const candle of candles) {
      const sourceIndex = sourceIndexByTime.get(candle.time);
      const previousClose =
        sourceIndex !== undefined && sourceIndex > 0 ? sourceCandles[sourceIndex - 1].close : stock.previousClose;
      const change = candle.close - previousClose;
      const institutionalPoint = institutionalByTime.get(candle.time);
      const holderPoint = majorHolderByTime.get(candle.time);
      const ma = maByTime.get(candle.time);

      quotes.set(candle.time, {
        candle,
        change,
        changePercent: previousClose > 0 ? (change / previousClose) * 100 : 0,
        foreignInvestor: institutionalPoint?.foreignInvestor ?? 0,
        investmentTrust: institutionalPoint?.investmentTrust ?? 0,
        majorHolder: holderPoint?.value ?? null,
        ma5: ma?.ma5 ?? null,
        ma10: ma?.ma10 ?? null,
        ma20: ma?.ma20 ?? null,
        ma60: ma?.ma60 ?? null
      });
    }
    return quotes;
  }, [candles, institutionalByTime, maByTime, majorHolderByTime, sourceCandles, sourceIndexByTime, stock.previousClose]);

  const candleData = useMemo(
    () =>
      candles.map((candle) => ({
        time: candle.time as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close
      })),
    [candles]
  );

  const volumeData = useMemo(
    () =>
      candles.map((candle, index) => {
        const previousClose = index > 0 ? candles[index - 1].close : candle.close;
        const color =
          candle.close > previousClose
            ? "rgba(255, 77, 103, 0.82)"
            : candle.close < previousClose
              ? "rgba(76, 175, 80, 0.82)"
              : "rgba(15, 23, 42, 0.82)";

        return {
          time: candle.time as Time,
          value: candle.volume / 1_000,
          color
        };
      }),
    [candles]
  );

  const movingAverages = useMemo(
    () => [periodMa.ma5, periodMa.ma10, periodMa.ma20, periodMa.ma60].map((points) => points.filter((point) => visibleTimes.has(point.time))),
    [periodMa, visibleTimes]
  );

  const volumeMa = useMemo(
    () => simpleVolumeMovingAverage(sourceCandles, 5).filter((point) => visibleTimes.has(point.time)),
    [sourceCandles, visibleTimes]
  );

  const foreignBars = useMemo(
    () =>
      institutionalFlows.map((point) => ({
        time: point.time as Time,
        value: point.foreignInvestor,
        color: point.foreignInvestor >= 0 ? "rgba(255, 77, 103, 0.82)" : "rgba(76, 175, 80, 0.82)"
      })),
    [institutionalFlows]
  );

  const trustBars = useMemo(
    () =>
      institutionalFlows.map((point) => ({
        time: point.time as Time,
        value: point.investmentTrust,
        color: point.investmentTrust >= 0 ? "rgba(255, 77, 103, 0.82)" : "rgba(76, 175, 80, 0.82)"
      })),
    [institutionalFlows]
  );

  const foreignLine = useMemo(
    () =>
      movingAverage(
        institutionalFlows.map((point) => ({ time: point.time, value: point.foreignInvestor })),
        10
      ).map((point) => ({ time: point.time as Time, value: point.value })),
    [institutionalFlows]
  );

  const trustLine = useMemo(
    () =>
      movingAverage(
        institutionalFlows.map((point) => ({ time: point.time, value: point.investmentTrust })),
        10
      ).map((point) => ({ time: point.time as Time, value: point.value })),
    [institutionalFlows]
  );

  const holderBars = useMemo(() => {
    if (period === "daily") {
      return majorHolderPoints.map((point) => {
        const weeklyDelta = majorHolderWeeklyDelta.get(getWeekKey(point.time)) ?? 0;
        const color =
          weeklyDelta > 0
            ? "rgba(255, 77, 103, 0.76)"
            : weeklyDelta < 0
              ? "rgba(76, 175, 80, 0.76)"
              : "rgba(100, 116, 139, 0.72)";
        return {
          time: point.time as Time,
          value: point.value,
          color
        };
      });
    }

    return majorHolderPoints.map((point, index, records) => {
      const previous = records[index - 1]?.value ?? point.value;
      return {
        time: point.time as Time,
        value: point.value,
        color: point.value >= previous ? "rgba(255, 77, 103, 0.76)" : "rgba(76, 175, 80, 0.76)"
      };
    });
  }, [majorHolderPoints, majorHolderWeeklyDelta, period]);

  const holderScaleRange = useMemo(() => {
    if (!holderBars.length) return null;
    const values = holderBars.map((point) => point.value);
    const maxValue = Math.max(...values);
    const minValue = Math.min(...values);
    const floor = Math.floor((minValue - 0.2) * 10) / 10;
    const from = floor < maxValue ? floor : maxValue - 0.1;
    const to = maxValue;
    return { from, to: to > from ? to : from + 0.1 };
  }, [holderBars]);

  const mainPriceBounds = useMemo(() => {
    if (!candles.length) return null;
    const lows = candles.map((c) => c.low);
    const highs = candles.map((c) => c.high);
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    return { min, max };
  }, [candles]);

  useEffect(() => {
    lineModeRef.current = drawToolMode === "line";
    if (drawToolMode !== "line") {
      pendingDrawAnchorRef.current = null;
      setPendingDrawAnchor(null);
      setPreviewLineEnd(null);
    }
  }, [drawToolMode]);

  useEffect(() => {
    drawColorRef.current = DRAW_COLORS[drawColorKey];
  }, [drawColorKey]);

  useEffect(() => {
    drawLinesRef.current = drawLines;
    if (selectedLineId && !drawLines.some((line) => line.id === selectedLineId)) {
      setSelectedLineId(null);
    }
  }, [drawLines, selectedLineId]);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      height: 780,
      layout: {
        background: { type: ColorType.Solid, color: "#F8FAFC" },
        textColor: "#0F172A",
        panes: {
          separatorColor: "#CBD5E1",
          separatorHoverColor: "#94A3B8",
          enableResize: true
        }
      },
      localization: {
        locale: "zh-TW",
        dateFormat: "yyyy/MM/dd"
      },
      grid: {
        vertLines: { color: "rgba(148, 163, 184, 0.28)" },
        horzLines: { color: "rgba(148, 163, 184, 0.28)" }
      },
      rightPriceScale: { borderColor: "#CBD5E1" },
      timeScale: {
        borderColor: "#CBD5E1",
        timeVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true
      },
      crosshair: { mode: CrosshairMode.Normal }
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#FF3030",
      downColor: "#111827",
      wickUpColor: "#FF3030",
      wickDownColor: "#111827",
      borderUpColor: "#FF3030",
      borderDownColor: "#111827"
    });

    const maColors = ["#111827", "#2563EB", "#FF3030", "#F97316"];
    maSeriesRef.current = maColors.map((color) =>
      chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false
      })
    );

    const volumeSeries = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false },
      1
    );
    const volumeMaSeries = chart.addSeries(
      LineSeries,
      { color: "#0284C7", lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
      1
    );
    const foreignSeries = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false },
      2
    );
    const foreignLineSeries = chart.addSeries(
      LineSeries,
      { color: "#06B6D4", lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
      2
    );
    const trustSeries = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false },
      3
    );
    const trustLineSeries = chart.addSeries(
      LineSeries,
      { color: "#06B6D4", lineWidth: 1, priceLineVisible: false, lastValueVisible: false },
      3
    );
    const holdersSeries = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: {
          type: "custom",
          minMove: 0.01,
          formatter: (value: number) => `${value.toFixed(2)}%`
        },
        priceLineVisible: false,
        lastValueVisible: false
      },
      4
    );

    const panes = chart.panes();
    panes[0]?.setStretchFactor(4.6);
    panes[1]?.setStretchFactor(1.45);
    panes[2]?.setStretchFactor(1.45);
    panes[3]?.setStretchFactor(1.45);
    panes[4]?.setStretchFactor(1.55);

    chart.priceScale("right", 2).applyOptions({ autoScale: true, scaleMargins: { top: 0.08, bottom: 0.08 } });
    chart.priceScale("right", 3).applyOptions({ autoScale: true, scaleMargins: { top: 0.08, bottom: 0.08 } });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    volumeMaSeriesRef.current = volumeMaSeries;
    foreignSeriesRef.current = foreignSeries;
    foreignLineRef.current = foreignLineSeries;
    trustSeriesRef.current = trustSeries;
    trustLineRef.current = trustLineSeries;
    holdersSeriesRef.current = holdersSeries;

    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      const time = toDateKey(param.time);
      setQuote(time ? quoteByTime.get(time) ?? null : null);

      if (!lineModeRef.current || !pendingDrawAnchorRef.current || !param.point) {
        setPreviewLineEnd(null);
        return;
      }
      const mainPaneBottom = (containerRef.current?.clientHeight ?? 780) * (4.6 / 10.5);
      if (param.point.y < 0 || param.point.y > mainPaneBottom) {
        setPreviewLineEnd(null);
        return;
      }
      const hoveredTime = toDateKey(param.time);
      const hoveredPrice = candleSeries.coordinateToPrice(param.point.y);
      if (!hoveredTime || hoveredPrice === null || Number.isNaN(hoveredPrice)) {
        setPreviewLineEnd(null);
        return;
      }
      if (!Number.isFinite(hoveredPrice)) {
        setPreviewLineEnd(null);
        return;
      }
      if (mainPriceBounds) {
        const lowerBound = mainPriceBounds.min * 0.4;
        const upperBound = mainPriceBounds.max * 1.8;
        if (hoveredPrice < lowerBound || hoveredPrice > upperBound) {
          setPreviewLineEnd(null);
          return;
        }
      }
      const firstAnchor = pendingDrawAnchorRef.current;
      if (!firstAnchor || firstAnchor.time === hoveredTime) {
        setPreviewLineEnd(null);
        return;
      }
      setPreviewLineEnd({ time: hoveredTime, value: hoveredPrice });
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    const handleChartClick = (param: MouseEventParams<Time>) => {
      if (!param.point) return;
      const mainPaneBottom = (containerRef.current?.clientHeight ?? 780) * (4.6 / 10.5);
      if (param.point.y < 0 || param.point.y > mainPaneBottom) return;

      if (!lineModeRef.current) {
        const clickX = param.point.x;
        const clickY = param.point.y;
        let nearestId: string | null = null;
        let nearestDistance = Number.POSITIVE_INFINITY;
        const tolerance = 8;

        for (const line of drawLinesRef.current) {
          const x1 = chart.timeScale().timeToCoordinate(line.start.time as Time);
          const x2 = chart.timeScale().timeToCoordinate(line.end.time as Time);
          const y1 = candleSeries.priceToCoordinate(line.start.value);
          const y2 = candleSeries.priceToCoordinate(line.end.value);
          if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
          const distance = distanceToSegment(clickX, clickY, x1, y1, x2, y2);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestId = line.id;
          }
        }

        setSelectedLineId(nearestDistance <= tolerance ? nearestId : null);
        return;
      }

      const clickedTime = toDateKey(param.time);
      const clickedPrice = candleSeries.coordinateToPrice(param.point.y);
      if (!clickedTime || clickedPrice === null || Number.isNaN(clickedPrice)) return;
      if (!Number.isFinite(clickedPrice)) return;
      if (mainPriceBounds) {
        const lowerBound = mainPriceBounds.min * 0.4;
        const upperBound = mainPriceBounds.max * 1.8;
        if (clickedPrice < lowerBound || clickedPrice > upperBound) return;
      }

      const nextAnchor: DrawAnchor = { time: clickedTime, value: clickedPrice };
      const firstAnchor = pendingDrawAnchorRef.current;
      if (!firstAnchor) {
        pendingDrawAnchorRef.current = nextAnchor;
        setPendingDrawAnchor(nextAnchor);
        setPreviewLineEnd(nextAnchor);
        return;
      }

      pendingDrawAnchorRef.current = null;
      setPendingDrawAnchor(null);
      setPreviewLineEnd(null);
      if (firstAnchor.time === nextAnchor.time) {
        // lightweight-charts 的 line data 不能有重複 time，避免渲染異常
        pendingDrawAnchorRef.current = nextAnchor;
        setPendingDrawAnchor(nextAnchor);
        setPreviewLineEnd(nextAnchor);
        return;
      }
      const [start, end] = sortLineAnchors(firstAnchor, nextAnchor);
      setDrawLines((prev) => [
        ...prev,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, start, end, color: drawColorRef.current }
      ]);
    };
    chart.subscribeClick(handleChartClick);
    setChartEpoch((prev) => prev + 1);

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.unsubscribeClick(handleChartClick);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      volumeMaSeriesRef.current = null;
      foreignSeriesRef.current = null;
      foreignLineRef.current = null;
      trustSeriesRef.current = null;
      trustLineRef.current = null;
      holdersSeriesRef.current = null;
      maSeriesRef.current = [];
      drawingSeriesRef.current = [];
      previewSeriesRef.current = null;
      pendingDrawAnchorRef.current = null;
    };
  }, [mainPriceBounds, quoteByTime]);

  useEffect(() => {
    candleSeriesRef.current?.setData(candleData);
    volumeSeriesRef.current?.setData(volumeData);
    volumeMaSeriesRef.current?.setData(volumeMa.map((point) => ({ time: point.time as Time, value: point.value / 1_000 })));
    foreignSeriesRef.current?.setData(foreignBars);
    foreignLineRef.current?.setData(foreignLine);
    trustSeriesRef.current?.setData(trustBars);
    trustLineRef.current?.setData(trustLine);
    holdersSeriesRef.current?.setData(holderBars);

    const holderPriceScale = chartRef.current?.priceScale("right", 4);
    if (holderScaleRange && holderPriceScale) {
      holderPriceScale.setAutoScale(false);
      holderPriceScale.setVisibleRange(holderScaleRange);
    } else if (holderPriceScale) {
      holderPriceScale.setAutoScale(true);
    }

    maSeriesRef.current.forEach((series, index) => {
      const key = MA_KEYS[index];
      if (!maVisibility[key]) {
        series.setData([]);
        return;
      }
      series.setData(movingAverages[index].map((point) => ({ time: point.time as Time, value: point.value })));
    });

    if (candles.length) {
      chartRef.current?.timeScale().setVisibleLogicalRange({
        from: Math.max(0, candles.length - 80),
        to: candles.length - 1
      });
      setQuote(quoteByTime.get(candles[candles.length - 1].time) ?? null);
    }
  }, [
    candleData,
    candles,
    foreignBars,
    foreignLine,
    holderBars,
    movingAverages,
    quoteByTime,
    holderScaleRange,
    maVisibility,
    trustBars,
    trustLine,
    volumeData,
    volumeMa
  ]);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.style.cursor = drawToolMode === "none" ? "default" : "crosshair";
  }, [drawToolMode]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    for (const series of drawingSeriesRef.current) {
      try {
        chart.removeSeries(series);
      } catch {
        // ignore stale series reference
      }
    }
    drawingSeriesRef.current = [];

    for (const line of drawLines) {
      if (line.start.time === line.end.time) continue;
      if (!Number.isFinite(line.start.value) || !Number.isFinite(line.end.value)) continue;
      const [start, end] = sortLineAnchors(line.start, line.end);
      const isSelected = line.id === selectedLineId;
      const series = chart.addSeries(LineSeries, {
        color: isSelected ? "#0F172A" : line.color,
        lineWidth: isSelected ? 3 : 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      try {
        series.setData([
          { time: start.time as Time, value: start.value },
          { time: end.time as Time, value: end.value }
        ]);
      } catch {
        chart.removeSeries(series);
        continue;
      }
      drawingSeriesRef.current.push(series);
    }

  }, [chartEpoch, drawLines, selectedLineId]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (!previewSeriesRef.current) {
      previewSeriesRef.current = chart.addSeries(LineSeries, {
        color: DRAW_COLORS[drawColorKey],
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        pointMarkersVisible: true,
        pointMarkersRadius: 3,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
    }

    const previewSeries = previewSeriesRef.current;
    if (!previewSeries) return;

    if (
      drawToolMode !== "line" ||
      !pendingDrawAnchor ||
      !previewLineEnd ||
      pendingDrawAnchor.time === previewLineEnd.time
    ) {
      previewSeries.setData([]);
      return;
    }

    const [start, end] = sortLineAnchors(pendingDrawAnchor, previewLineEnd);
    previewSeries.applyOptions({ color: DRAW_COLORS[drawColorKey] });
    try {
      previewSeries.setData([
        { time: start.time as Time, value: start.value },
        { time: end.time as Time, value: end.value }
      ]);
    } catch {
      previewSeries.setData([]);
    }
  }, [chartEpoch, drawColorKey, drawToolMode, pendingDrawAnchor, previewLineEnd]);

  const activeQuote = quote ?? (candles.length ? quoteByTime.get(candles[candles.length - 1].time) ?? null : null);
  const activePreviousClose = activeQuote ? activeQuote.candle.close - activeQuote.change : null;
  const MAIN_PANE_BOUNDARY_TOP = "43.81%";
  const SUB_PANE_ROWS = "4.6fr 1.45fr 1.45fr 1.45fr 1.55fr";

  return (
    <Card
      title={`${stock.name}(${stock.symbol})`}
      titleClassName="text-slate-800"
      action={
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <button
            type="button"
            onClick={() => {
              pendingDrawAnchorRef.current = null;
              setPendingDrawAnchor(null);
              setPreviewLineEnd(null);
              setSelectedLineId(null);
              setDrawToolMode((prev) => (prev === "line" ? "none" : "line"));
            }}
            className={clsx(
              "rounded border px-2.5 py-1 font-semibold transition",
              drawToolMode === "line"
                ? "border-sky-500 bg-sky-500 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-950"
            )}
          >
            畫線
          </button>
          <button
            type="button"
            onClick={() => {
              pendingDrawAnchorRef.current = null;
              setPendingDrawAnchor(null);
              setPreviewLineEnd(null);
              setDrawToolMode("none");
            }}
            className={clsx(
              "hidden rounded border px-2.5 py-1 font-semibold transition",
              false
                ? "border-sky-500 bg-sky-500 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-950"
            )}
          >
            塗鴉筆
          </button>
          <button
            type="button"
            onClick={() => {
              pendingDrawAnchorRef.current = null;
              setPendingDrawAnchor(null);
              setPreviewLineEnd(null);
              setDrawLines([]);
              setSelectedLineId(null);
            }}
            className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
          >
            清除畫線
          </button>
          <button
            type="button"
            onClick={() => {
              if (pendingDrawAnchorRef.current) {
                pendingDrawAnchorRef.current = null;
                setPendingDrawAnchor(null);
                setPreviewLineEnd(null);
                return;
              }
              setDrawLines((prev) => prev.slice(0, -1));
            }}
            className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => setDrawLines((prev) => prev.slice(0, -1))}
            className="rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-950"
          >
            刪除最後一筆
          </button>
          <button
            type="button"
            onClick={() => {
              if (!selectedLineId) return;
              setDrawLines((prev) => prev.filter((line) => line.id !== selectedLineId));
            }}
            className={clsx(
              "rounded border px-2.5 py-1 font-semibold transition",
              selectedLineId
                ? "border-rose-400 bg-rose-50 text-rose-700 hover:border-rose-500"
                : "border-slate-300 bg-white text-slate-400"
            )}
          >
            刪除選取
          </button>
          <div className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2 py-1">
            {(Object.keys(DRAW_COLORS) as DrawColorKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setDrawColorKey(key)}
                className={clsx(
                  "h-4 w-4 rounded-full border transition",
                  drawColorKey === key ? "border-slate-700 ring-1 ring-slate-500" : "border-slate-300"
                )}
                style={{ backgroundColor: DRAW_COLORS[key] }}
                aria-label={`draw-color-${key}`}
                title={key}
              />
            ))}
          </div>
          <div className="flex rounded-md border border-slate-300 bg-white p-0.5">
            {(["daily", "weekly"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onPeriodChange(option)}
                className={clsx(
                  "min-w-12 rounded px-2.5 py-1 font-semibold transition",
                  period === option ? "bg-sky-500 text-white" : "text-slate-600 hover:text-slate-950"
                )}
              >
                {getPaneLabel(option)}
              </button>
            ))}
          </div>
          {MA_BUTTONS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() =>
                setMaVisibility((prev) => ({
                  ...prev,
                  [item.key]: !prev[item.key]
                }))
              }
              className={clsx(
                "font-semibold transition",
                item.colorClass,
                maVisibility[item.key] ? "opacity-100" : "opacity-35 line-through"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      }
      className="overflow-hidden bg-slate-50"
    >
      <div className="relative">
        {activeQuote ? (
          <div className="pointer-events-none absolute inset-0 z-10">
            <div className="ml-1 mt-1 w-fit max-w-[calc(100%-0.5rem)] rounded border border-slate-300 bg-white/92 px-1.5 py-1 text-slate-950 shadow-sm">
              <div className="flex flex-wrap items-center gap-x-2 text-[13px] font-semibold leading-5">
                <span>{stock.name}({stock.symbol})</span>
                <span>{getPeriodChartLabel(period)}</span>
                <span>{formatDisplayDate(activeQuote.candle.time)}</span>
                <span>
                  開{" "}
                  <span className={priceRelativeColor(activeQuote.candle.open, activePreviousClose ?? activeQuote.candle.open)}>
                    {formatPrice(activeQuote.candle.open)}
                  </span>
                </span>
                <span>
                  高{" "}
                  <span className={priceRelativeColor(activeQuote.candle.high, activePreviousClose ?? activeQuote.candle.high)}>
                    {formatPrice(activeQuote.candle.high)}
                  </span>
                </span>
                <span>
                  低{" "}
                  <span className={priceRelativeColor(activeQuote.candle.low, activePreviousClose ?? activeQuote.candle.low)}>
                    {formatPrice(activeQuote.candle.low)}
                  </span>
                </span>
                <span>
                  收{" "}
                  <span className={priceRelativeColor(activeQuote.candle.close, activePreviousClose ?? activeQuote.candle.close)}>
                    {formatPrice(activeQuote.candle.close)}
                  </span>
                </span>
                <span className={valueColor(activeQuote.change)}>
                  {formatSigned(activeQuote.change, 2)} ({formatSigned(activeQuote.changePercent, 2)}%)
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] font-semibold leading-4">
                <span className="text-slate-900">MA5 {activeQuote.ma5 === null ? "--" : formatPrice(activeQuote.ma5)}</span>
                <span className="text-blue-600">MA10 {activeQuote.ma10 === null ? "--" : formatPrice(activeQuote.ma10)}</span>
                <span className="text-red-500">MA20 {activeQuote.ma20 === null ? "--" : formatPrice(activeQuote.ma20)}</span>
                <span className="text-orange-500">MA60 {activeQuote.ma60 === null ? "--" : formatPrice(activeQuote.ma60)}</span>
              </div>
            </div>

            {drawToolMode === "line" ? (
              <div className="ml-1 mt-1 w-fit rounded border border-slate-300 bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-sky-700 shadow-sm">
                {pendingDrawAnchor ? "● 已選 A 點，請點 B 點完成畫線" : "＋ 點 A 點開始畫線"}
              </div>
            ) : null}
            {false ? (
              <div className="ml-1 mt-1 w-fit rounded border border-slate-300 bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-sky-700 shadow-sm">
                ✎ 塗鴉模式：按住滑鼠左鍵自由畫線
              </div>
            ) : null}

            <div
              className="absolute right-2 -translate-y-1/2 rounded border border-slate-300 bg-white/95 px-1 py-0.5 text-[10px] font-semibold text-sky-700 shadow-sm"
              style={{ top: MAIN_PANE_BOUNDARY_TOP }}
            >
              {formatDisplayDate(activeQuote.candle.time)}
            </div>

            <div className="absolute inset-0 grid" style={{ gridTemplateRows: SUB_PANE_ROWS }}>
              <div />
              <div className="relative h-full">
                <SubPaneValue
                  className="absolute left-1 top-1 z-10"
                  label="成交量"
                  value={formatTradingVolume(activeQuote.candle.volume)}
                />
              </div>
              <div className="relative h-full">
                <SubPaneValue
                  className="absolute left-1 top-1 z-10"
                  label="外資"
                  value={formatNetLots(activeQuote.foreignInvestor)}
                  valueClassName={valueColor(activeQuote.foreignInvestor)}
                />
              </div>
              <div className="relative h-full">
                <SubPaneValue
                  className="absolute left-1 top-1 z-10"
                  label="投信"
                  value={formatNetLots(activeQuote.investmentTrust)}
                  valueClassName={valueColor(activeQuote.investmentTrust)}
                />
              </div>
              <div className="relative h-full">
                <SubPaneValue
                  className="absolute left-1 top-1 z-10"
                  label="大戶持股"
                  value={activeQuote.majorHolder === null ? "--" : `${activeQuote.majorHolder.toFixed(2)}%`}
                />
              </div>
            </div>
          </div>
        ) : null}
        <div ref={containerRef} className="h-[780px] w-full" />
      </div>
    </Card>
  );
}
