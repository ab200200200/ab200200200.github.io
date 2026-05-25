export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat("zh-TW", options).format(value);
}

export function formatSigned(value: number, digits = 0): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatNumber(value, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  })}`;
}

export function formatVolume(value: number): string {
  if (Math.abs(value) >= 100_000_000) {
    return `${formatNumber(value / 100_000_000, { maximumFractionDigits: 2 })} 億股`;
  }

  if (Math.abs(value) >= 10_000) {
    return `${formatNumber(value / 10_000, { maximumFractionDigits: 2 })} 萬股`;
  }

  return `${formatNumber(value)} 股`;
}

export function formatTradingVolume(value: number): string {
  return `${formatNumber(value / 1_000, { maximumFractionDigits: 0 })} 張`;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatIsoDate(value?: string | null): string {
  if (!value) return "--";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(`${value}T00:00:00+08:00`));
}
