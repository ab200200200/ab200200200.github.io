export type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type StockSummary = {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  previousClose: number;
  marketTime: string;
  candles: Candle[];
  dataSource: string;
  warnings: string[];
  dataQuality: {
    candleCount: number;
    hasHistoricalDailyCandles: boolean;
    latestDate: string | null;
  };
};

export type MovingAveragePoint = {
  time: string;
  value: number;
};

export type MovingAverageSet = {
  ma5: MovingAveragePoint[];
  ma10: MovingAveragePoint[];
  ma20: MovingAveragePoint[];
  ma60: MovingAveragePoint[];
};

export type TechnicalResponse = {
  id: string;
  ma: MovingAverageSet;
  maByPeriod: {
    daily: MovingAverageSet;
    weekly: MovingAverageSet;
  };
  volume: {
    volumeMa5: MovingAveragePoint[];
    todayVolume: number;
    average5: number | null;
    isVolumeSpike: boolean | null;
    spikeRatio: number | null;
  };
  warnings: string[];
  dataQuality: {
    candleCount: number;
    canCalculateMa5: boolean;
    canCalculateMa10: boolean;
    canCalculateMa20: boolean;
    canCalculateMa60: boolean;
  };
};

export type InstitutionalRecord = {
  date: string;
  foreignInvestor: number;
  investmentTrust: number;
  dealer: number;
  total: number;
};

export type InstitutionalResponse = {
  id: string;
  latest: InstitutionalRecord | null;
  records: InstitutionalRecord[];
  streak: {
    buyDays: number;
    sellDays: number;
    direction: "buy" | "sell" | "flat";
  };
  warnings: string[];
};

export type MajorHolderRecord = {
  date: string;
  percentage: number;
  shares: number;
  holders: number;
};

export type MajorHoldersResponse = {
  id: string;
  latest: MajorHolderRecord | null;
  records: MajorHolderRecord[];
  trend: {
    weeklyChange: number;
    fourWeekChange: number;
    direction: "up" | "down" | "flat";
  };
  warnings: string[];
};
