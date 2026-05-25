import clsx from "clsx";

type MetricCardProps = {
  label: string;
  value: string;
  subValue?: string;
  tone?: "neutral" | "up" | "down" | "warning";
};

export function MetricCard({ label, value, subValue, tone = "neutral" }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-ink-800/70 p-2.5">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p
        className={clsx(
          "mt-1 text-lg font-semibold tabular-nums leading-none",
          tone === "up" && "text-bull",
          tone === "down" && "text-bear",
          tone === "warning" && "text-amber-300",
          tone === "neutral" && "text-slate-50"
        )}
      >
        {value}
      </p>
      {subValue ? <p className="mt-0.5 text-[10px] text-slate-500">{subValue}</p> : null}
    </div>
  );
}
