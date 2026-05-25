import type { PropsWithChildren, ReactNode } from "react";
import clsx from "clsx";

type CardProps = PropsWithChildren<{
  title?: string;
  action?: ReactNode;
  className?: string;
  titleClassName?: string;
}>;

export function Card({ title, action, className, titleClassName, children }: CardProps) {
  return (
    <section className={clsx("rounded-lg border border-white/10 bg-ink-850/80 shadow-glow", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          {title ? <h2 className={clsx("text-sm font-semibold text-slate-100", titleClassName)}>{title}</h2> : <span />}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
