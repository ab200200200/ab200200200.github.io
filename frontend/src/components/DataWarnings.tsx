import { AlertTriangle } from "lucide-react";

type DataWarningsProps = {
  warnings: string[];
};

export function DataWarnings({ warnings }: DataWarningsProps) {
  if (warnings.length === 0) return null;

  return (
    <section className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-4 text-amber-100">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div>
          <p className="text-sm font-semibold">資料品質提醒</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-100/85">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
