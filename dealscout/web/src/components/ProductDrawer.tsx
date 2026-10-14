import { ExternalLink, Info } from "lucide-react";
import type { Confidence, ScoredItem } from "../api/types";
import { absoluteDate, inr } from "../lib/format";
import { Dialog } from "./Dialog";
import { DiscountTruth } from "./DiscountTruth";
import { PriceChart } from "./PriceChart";
import { VerdictBadge } from "./VerdictBadge";

const CONF_LINE: Record<Confidence, string> = {
  high: "High confidence: a long, consistent price history backs this verdict.",
  medium: "Medium confidence: there is a decent amount of history, but the price is not clearly at an extreme.",
  low: "Low confidence: less than 2 weeks of data, so treat this as a first impression.",
};

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="tabular mt-0.5 text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

export function ProductDrawer({ item, onClose }: { item: ScoredItem | null; onClose: () => void }) {
  return (
    <Dialog open={!!item} onClose={onClose} title={item?.product.name ?? "Product details"} variant="drawer">
      {item && <Body item={item} />}
    </Dialog>
  );
}

function Body({ item }: { item: ScoredItem }) {
  const { product: p, verdict: v, stats, dataNotes } = item;
  return (
    <div className="space-y-6 p-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-slate-500">{p.store}</p>
          <VerdictBadge label={v.label} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="tabular text-3xl font-semibold">{inr(p.currentPrice)}</span>
          {p.claimedOriginal !== null && <span className="tabular text-slate-400 line-through">{inr(p.claimedOriginal)}</span>}
        </div>
        <DiscountTruth verdict={v} />
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          Open at {p.store} <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      </header>

      <section aria-labelledby="chart-h">
        <h3 id="chart-h" className="mb-2 text-sm font-semibold">
          Price history
        </h3>
        <PriceChart item={item} />
      </section>

      {stats && (
        <section aria-labelledby="stats-h">
          <h3 id="stats-h" className="mb-2 text-sm font-semibold">
            The numbers
          </h3>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Tile label="Lowest" value={inr(stats.lowest)} />
            <Tile label="Typical (median)" value={inr(stats.median)} />
            <Tile label="Highest" value={inr(stats.highest)} />
            <Tile label="Observations" value={String(stats.count)} />
            <Tile label="Period" value={`${absoluteDate(stats.firstDate)} – ${absoluteDate(stats.lastDate)}, ${stats.days} days`} />
            <Tile label="Synthetic points" value={`${stats.seededCount} of ${stats.count}`} />
          </dl>
        </section>
      )}

      <section aria-labelledby="why-h">
        <h3 id="why-h" className="mb-2 text-sm font-semibold">
          Why this verdict
        </h3>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          {v.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-slate-500">{CONF_LINE[v.confidence]}</p>
      </section>

      {dataNotes.length > 0 && (
        <aside className="flex gap-2.5 rounded-xl bg-violet-50 p-3.5 text-sm text-violet-900" aria-label="Data notes">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <ul className="space-y-1">
            {dataNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </aside>
      )}

      {p.features.length > 0 && (
        <section aria-labelledby="feat-h">
          <h3 id="feat-h" className="mb-2 text-sm font-semibold">
            Features
          </h3>
          <ul className="flex flex-wrap gap-2">
            {p.features.map((f) => (
              <li key={f} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">
                {f}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
