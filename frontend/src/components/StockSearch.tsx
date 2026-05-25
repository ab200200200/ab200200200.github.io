import { FormEvent, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

type RecentSearchItem = {
  symbol: string;
  name: string;
};

type StockSearchProps = {
  initialValue: string;
  onSearch: (stockId: string) => void;
  recentSearches: RecentSearchItem[];
};

function formatRecentLabel(item: RecentSearchItem): string {
  const nameLength = Array.from(item.name).length;
  return nameLength > 6 ? item.symbol : item.name;
}

export function StockSearch({ initialValue, onSearch, recentSearches }: StockSearchProps) {
  const [value, setValue] = useState(initialValue);
  const recentItems = useMemo(() => recentSearches.slice(0, 10), [recentSearches]);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = value.trim().toUpperCase();
    if (normalized) onSearch(normalized);
  }

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <form onSubmit={handleSubmit} className="flex w-full max-w-xl items-center gap-2 rounded-lg border border-white/10 bg-ink-900 p-2">
        <Search className="ml-2 h-5 w-5 text-slate-500" />
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="輸入台股代號，例如 2330、0050、2317"
          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600"
        />
        <button
          type="submit"
          className="rounded-md bg-bull px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-emerald-300"
        >
          搜尋
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        {recentItems.map((item) => (
          <button
            key={item.symbol}
            type="button"
            onClick={() => {
              setValue(item.symbol);
              onSearch(item.symbol);
            }}
            title={`${item.name}(${item.symbol})`}
            className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:border-bull/70 hover:text-white"
          >
            {formatRecentLabel(item)}
          </button>
        ))}
      </div>
    </div>
  );
}
