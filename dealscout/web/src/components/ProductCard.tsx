import { AudioLines, ExternalLink, Store } from "lucide-react";
import type { ScoredItem } from "../api/types";
import { inr } from "../lib/format";
import { DiscountTruth } from "./DiscountTruth";
import { Sparkline } from "./Sparkline";
import { ConfidenceMeter, VerdictBadge } from "./VerdictBadge";

interface Props {
  item: ScoredItem;
  onOpen: () => void;
  index: number;
}

export function ProductCard({ item, onOpen, index }: Props) {
  const { product: p, verdict: v, stats, history } = item;
  const over = v.label === "skip";
  const synthetic = history.length > 0 && history.every((h) => h.provenance === "seeded");
  return (
    <article
      className={`rise flex flex-col gap-3.5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_5px_16px_rgba(34,40,62,0.04)] transition-shadow hover:shadow-[0_12px_30px_rgba(60,62,140,0.1)] ${over ? "opacity-60" : ""}`}
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-100 text-indigo-600" aria-hidden>
          <AudioLines className="h-5 w-5" />
        </span>
        <div className="flex flex-col items-end gap-1.5">
          <VerdictBadge label={v.label} />
          <ConfidenceMeter level={v.confidence} />
        </div>
      </div>

      <div>
        <p className="flex items-center gap-1.5 text-sm text-slate-500">
          <Store className="h-3.5 w-3.5" aria-hidden /> {p.store}
        </p>
        <h3 className="mt-1 line-clamp-2 text-lg font-bold leading-snug tracking-tight">{p.name}</h3>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="tabular text-[28px] font-extrabold tracking-tight">{inr(p.currentPrice)}</span>
        {p.claimedOriginal !== null && (
          <span className="tabular text-sm text-slate-400 line-through">
            <span className="sr-only">Store's original price </span>
            {inr(p.claimedOriginal)}
          </span>
        )}
      </div>

      <DiscountTruth verdict={v} />
      {v.isLowestSeen && stats && (
        <span className="inline-flex w-fit items-center rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700">Lowest in {stats.days} days</span>
      )}

      <div>
        <Sparkline history={history} current={p.currentPrice} />
        {history.length > 1 && (
          <p className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
            <span>{history.length}-day price trend</span>
            <span className={`font-bold tracking-wider ${synthetic ? "text-indigo-500" : "text-emerald-700"}`}>{synthetic ? "DEMO" : "LIVE"}</span>
          </p>
        )}
      </div>

      {v.reasons[0] && <p className="line-clamp-2 text-sm text-slate-500">{v.reasons[0]}</p>}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-3.5 text-sm">
        <button type="button" onClick={onOpen} className="font-semibold text-indigo-600 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          View details
        </button>
        <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          Open at {p.store} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </article>
  );
}
