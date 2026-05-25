import type { Candle, MovingAveragePoint, MovingAverageSet, TechnicalResponse } from "../types.js";
import { round } from "./number.js";

export function simpleMovingAverage(
  candles: Candle[],
  period: number,
  valueSelector: (candle: Candle) => number,
  minimumSourceCount = period
): MovingAveragePoint[] {
  if (candles.length < minimumSourceCount) return [];

  const points: MovingAveragePoint[] = [];
  let rollingSum = 0;

  for (let index = 0; index < candles.length; index += 1) {
    rollingSum += valueSelector(candles[index]);

    if (index >= period) {
      rollingSum -= valueSelector(candles[index - period]);
    }

    if (index >= period - 1) {
      points.push({
        time: candles[index].time,
        value: round(rollingSum / period, 2)
      });
    }
  }

  return points;
}

function getWeekKey(dateText: string): string {
  const date = new Date(`${dateText}T00:00:00+08:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function aggregateWeeklyCandles(candles: Candle[]): Candle[] {
  const groups = new Map<string, Candle[]>();

  for (const candle of candles) {
    const weekKey = getWeekKey(candle.time);
    groups.set(weekKey, [...(groups.get(weekKey) ?? []), candle]);
  }

  return [...groups.values()].map((group) => {
    const first = group[0];
    const last = group[group.length - 1];
    return {
      time: last.time,
      open: first.open,
      high: Math.max(...group.map((candle) => candle.high)),
      low: Math.min(...group.map((candle) => candle.low)),
      close: last.close,
      volume: group.reduce((sum, candle) => sum + candle.volume, 0)
    };
  });
}

function buildMovingAverageSet(candles: Candle[]): MovingAverageSet {
  return {
    ma5: simpleMovingAverage(candles, 5, (candle) => candle.close, 180),
    ma10: simpleMovingAverage(candles, 10, (candle) => candle.close, 180),
    ma20: simpleMovingAverage(candles, 20, (candle) => candle.close, 180),
    ma60: simpleMovingAverage(candles, 60, (candle) => candle.close, 180)
  };
}

export function buildTechnicalResponse(id: string, candles: Candle[]): TechnicalResponse {
  const volumeMa5 = simpleMovingAverage(candles, 5, (candle) => candle.volume);
  const latestCandle = candles.at(-1);
  const latestVolumeMa = volumeMa5.at(-1);
  const todayVolume = latestCandle?.volume ?? 0;
  const average5 = latestVolumeMa?.value ?? null;
  const spikeRatio = average5 && average5 > 0 ? round(todayVolume / average5, 2) : null;
  const dailyMa = buildMovingAverageSet(candles);
  const weeklyMa = buildMovingAverageSet(aggregateWeeklyCandles(candles));
  const warnings: string[] = [];

  if (candles.length < 180) {
    warnings.push("K 線資料未滿 180 筆，MA5/MA10/MA20/MA60 暫不繪製。");
  }

  return {
    id,
    ma: dailyMa,
    maByPeriod: {
      daily: dailyMa,
      weekly: weeklyMa
    },
    volume: {
      volumeMa5,
      todayVolume,
      average5,
      isVolumeSpike: spikeRatio === null ? null : spikeRatio >= 1.8,
      spikeRatio
    },
    warnings,
    dataQuality: {
      candleCount: candles.length,
      canCalculateMa5: candles.length >= 180,
      canCalculateMa10: candles.length >= 180,
      canCalculateMa20: candles.length >= 180,
      canCalculateMa60: candles.length >= 180
    }
  };
}
