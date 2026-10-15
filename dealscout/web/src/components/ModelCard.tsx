import { CircleCheck, CircleHelp, ExternalLink, Package, RotateCcw } from "lucide-react";
import { inr, offerLinkLabel } from "../lib/format";
import type { ModelView } from "../lib/useSearch";
import { BudgetBadge, StretchBadge } from "./badges";

interface Props {
  view: ModelView;
  index: number;
  onOpen: () => void;
  onRetryDetails: () => void;
}

const Skeleton = ({ className }: { className: string }) => <span className={`block animate-pulse rounded bg-slate-100 ${className}`} aria-hidden />;

export function ModelCard({ view, index, onOpen, onRetryDetails }: Props) {
  const { model, details, priced, noListing, priceStatus } = view;
  const d = details.data;
  const cheapest = priced?.offers[0];
  const dim = !!noListing || (priced && !priced.withinBudget && !model.stretch);

  return (
    <article
      className={`rise flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_5px_16px_rgba(34,40,62,0.04)] transition-shadow hover:shadow-[0_12px_30px_rgba(60,62,140,0.1)] ${dim ? "opacity-70" : ""}`}
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-600" aria-hidden>
          <Package className="h-5 w-5" />
        </span>
        <div className="flex flex-wrap justify-end gap-1.5">
          {model.stretch && <StretchBadge />}
          {priced && <BudgetBadge item={priced} />}
        </div>
      </div>

      <h3 className="line-clamp-2 text-lg font-bold leading-snug tracking-tight">{model.name}</h3>

      <div className="min-h-[3.25rem]" aria-live="polite">
        {priceStatus === "loading" && (
          <>
            <span className="sr-only">Checking prices…</span>
            <Skeleton className="h-8 w-32" />
            <p className="mt-1.5 text-xs text-slate-400">Checking prices…</p>
          </>
        )}
        {priceStatus === "error" && <p className="text-sm text-slate-500">Prices unavailable right now.</p>}
        {priceStatus === "done" && noListing && <p className="text-sm text-slate-500">No matching listing on Google Shopping right now.</p>}
        {priced && cheapest && (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="tabular text-[28px] font-extrabold tracking-tight">{inr(priced.currentPrice)}</span>
              <span className="text-sm text-slate-500">at {cheapest.store}</span>
            </p>
            {priced.offers.length > 1 && (
              <p className="mt-0.5 text-xs text-slate-500">
                Also at{" "}
                {priced.offers
                  .slice(1, 3)
                  .map((o) => `${o.store} ${inr(o.price)}`)
                  .join(" · ")}
              </p>
            )}
          </>
        )}
      </div>

      <p className="line-clamp-3 text-sm text-slate-600">{d?.whyFits || model.why}</p>

      {details.status === "loading" && (
        <div className="space-y-1.5" aria-label="Loading details">
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      )}
      {details.status === "error" && (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          Couldn't load details.
          <button type="button" onClick={onRetryDetails} className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600">
            <RotateCcw className="h-3 w-3" aria-hidden /> Retry
          </button>
        </p>
      )}
      {d && (
        <>
          {d.mustHaveChecks.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {d.mustHaveChecks.map((c) => (
                <li
                  key={c.req}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                    c.result === "yes" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  }`}
                  title={c.evidence || undefined}
                >
                  {c.result === "yes" ? <CircleCheck className="h-3.5 w-3.5" aria-hidden /> : <CircleHelp className="h-3.5 w-3.5" aria-hidden />}
                  {c.req}
                  <span className="sr-only">{c.result === "yes" ? ": confirmed" : ": not confirmed"}</span>
                </li>
              ))}
            </ul>
          )}
          {d.keySpecs.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-slate-500">
              {d.keySpecs.slice(0, 3).map((s) => (
                <li key={s} className="line-clamp-1">
                  {s}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-3.5 text-sm">
        <button type="button" onClick={onOpen} className="font-semibold text-indigo-600 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          View details
        </button>
        {cheapest && (
          <a href={cheapest.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-right text-slate-500 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
            {offerLinkLabel(cheapest)} <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
          </a>
        )}
      </div>
    </article>
  );
}
