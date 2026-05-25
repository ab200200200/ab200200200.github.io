import type { Candle, InstitutionalRecord, MajorHolderRecord, MovingAveragePoint } from "../types/api";

export type KPeriod = "daily" | "weekly";

export type InstitutionalFlowPoint = {
  time: string;
  foreignInvestor: number;
  investmentTrust: number;
};

export type MajorHolderPoint = {
  time: string;
  value: number;
};

function parseIsoDate(dateText: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(dateText);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function formatUtcDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sortByTime<T extends { time: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => left.time.localeCompare(right.time));
}

function sortByDate<T extends { date: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => left.date.localeCompare(right.date));
}

export function getWeekKey(dateText: string): string {
  const date = parseIsoDate(dateText);
  if (!date) return dateText;
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return formatUtcDate(date);
}

export function aggregateCandles(candles: Candle[], period: KPeriod): Candle[] {
  const sorted = sortByTime(candles);
  if (period === "daily") return sorted;

  const groups = new Map<string, Candle[]>();
  for (const candle of sorted) {
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

export function limitVisibleCandles(candles: Candle[], count = 80): Candle[] {
  return sortByTime(candles).slice(-count);
}

export function simpleMovingAverage(candles: Candle[], period: number): MovingAveragePoint[] {
  const points: MovingAveragePoint[] = [];
  let rollingSum = 0;

  candles.forEach((candle, index) => {
    rollingSum += candle.close;
    if (index >= period) rollingSum -= candles[index - period].close;
    if (index >= period - 1) {
      points.push({
        time: candle.time,
        value: Number((rollingSum / period).toFixed(2))
      });
    }
  });

  return points;
}

export function simpleVolumeMovingAverage(candles: Candle[], period: number): MovingAveragePoint[] {
  const points: MovingAveragePoint[] = [];
  let rollingSum = 0;

  candles.forEach((candle, index) => {
    rollingSum += candle.volume;
    if (index >= period) rollingSum -= candles[index - period].volume;
    if (index >= period - 1) {
      points.push({
        time: candle.time,
        value: Math.round(rollingSum / period)
      });
    }
  });

  return points;
}

export function alignInstitutionalFlows(
  candles: Candle[],
  records: InstitutionalRecord[],
  period: KPeriod
): InstitutionalFlowPoint[] {
  const sortedRecords = sortByDate(records);
  const byDate = new Map(sortedRecords.map((record) => [record.date, record]));

  if (period === "daily") {
    return candles.map((candle) => {
      const record = byDate.get(candle.time);
      return {
        time: candle.time,
        foreignInvestor: record ? Math.round(record.foreignInvestor / 1000) : 0,
        investmentTrust: record ? Math.round(record.investmentTrust / 1000) : 0
      };
    });
  }

  const flowsByWeek = new Map<string, { foreignInvestor: number; investmentTrust: number }>();
  for (const record of sortedRecords) {
    const weekKey = getWeekKey(record.date);
    const current = flowsByWeek.get(weekKey) ?? { foreignInvestor: 0, investmentTrust: 0 };
    current.foreignInvestor += record.foreignInvestor;
    current.investmentTrust += record.investmentTrust;
    flowsByWeek.set(weekKey, current);
  }

  return candles.map((candle) => {
    const weekly = flowsByWeek.get(getWeekKey(candle.time));
    return {
      time: candle.time,
      foreignInvestor: weekly ? Math.round(weekly.foreignInvestor / 1000) : 0,
      investmentTrust: weekly ? Math.round(weekly.investmentTrust / 1000) : 0
    };
  });
}

export function alignMajorHolders(
  candles: Candle[],
  records: MajorHolderRecord[],
  period: KPeriod
): MajorHolderPoint[] {
  const sortedRecords = sortByDate(records);
  if (!sortedRecords.length) return [];

  const recordByWeek = new Map<string, MajorHolderRecord>();
  for (const record of sortedRecords) {
    recordByWeek.set(getWeekKey(record.date), record);
  }

  const seenWeeks = new Set<string>();
  const points: MajorHolderPoint[] = [];
  for (const candle of candles) {
    const weekKey = getWeekKey(candle.time);
    const record = recordByWeek.get(weekKey);
    if (!record) continue;
    if (period === "weekly" && seenWeeks.has(weekKey)) continue;
    seenWeeks.add(weekKey);

    points.push({
      time: candle.time,
      value: record.percentage
    });
  }

  return points;
}
