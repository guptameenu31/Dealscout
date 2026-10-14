import type { ReactNode } from "react";

interface Props {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}

/** Small spaced eyebrow, big heavy title ending in a violet full stop, quiet subtitle. */
export function PageHeading({ eyebrow, title, subtitle, action }: Props) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-[-0.035em] text-slate-900 sm:text-5xl">
          {title}
          <span className="text-indigo-600">.</span>
        </h1>
        {subtitle && <p className="mt-3 max-w-xl text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
