import { useState } from "react";
import { ChevronDown, ChevronLeft, PackageSearch, SearchX } from "lucide-react";
import type { WatchSpec } from "../api/types";
import { inr, relativeTime } from "../lib/format";
import type { ModelView } from "../lib/useSearch";
import { ModelCard } from "./ModelCard";
import { ModelDrawer } from "./ModelDrawer";

interface Props {
  spec: WatchSpec;
  models: ModelView[];
  failedMustHave: { view: ModelView; reason: string }[];
  counts: { withinBudget: number; overBudget: number; noListing: number };
  pricesCheckedAt: string | null;
  onBack: () => void;
  onRetryDetails: (modelId: string) => void;
}

export function SearchResults({ spec, models, failedMustHave, counts, pricesCheckedAt, onBack, onRetryDetails }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  // Look the open model up on every render so the drawer shows details as they arrive.
  const open = models.find((m) => m.model.id === openId) ?? failedMustHave.find((f) => f.view.model.id === openId)?.view ?? null;

  if (!models.length && !failedMustHave.length) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4" aria-live="polite">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-100 text-indigo-600" aria-hidden>
            <PackageSearch className="h-5 w-5" />
          </span>
          <p className="flex-1">
            <strong className="block font-bold text-slate-900">
              {pricesCheckedAt
                ? `${counts.withinBudget} model${counts.withinBudget === 1 ? "" : "s"} within ${inr(spec.budget)}`
                : `${models.length} model${models.length === 1 ? "" : "s"} shortlisted for you`}
            </strong>
            <span className="text-sm text-slate-500">
              {pricesCheckedAt
                ? `${counts.overBudget ? `${counts.overBudget} worth a look slightly over budget · ` : ""}Live prices from Google Shopping, checked ${relativeTime(pricesCheckedAt)}`
                : "Checking live prices at Indian stores…"}
            </span>
          </p>
        </div>
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          <ChevronLeft className="h-4 w-4" aria-hidden /> Edit your spec
        </button>
      </div>

      {models.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <SearchX className="mx-auto h-10 w-10 text-slate-400" aria-hidden />
          <p className="mt-3 font-medium">No models met all your must-haves</p>
          <p className="mt-1 text-sm text-slate-500">Try removing a must-have or raising the budget.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {models.map((v, i) => (
            <ModelCard key={v.model.id} view={v} index={i} onOpen={() => setOpenId(v.model.id)} onRetryDetails={() => onRetryDetails(v.model.id)} />
          ))}
        </div>
      )}

      {failedMustHave.length > 0 && (
        <details className="group rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-slate-700 focus-visible:outline-2 focus-visible:outline-indigo-600">
            {failedMustHave.length} model{failedMustHave.length > 1 ? "s" : ""} didn't meet your must-haves
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="mt-3 divide-y divide-slate-100">
            {failedMustHave.map((f) => (
              <li key={f.view.model.id} className="flex flex-wrap justify-between gap-x-4 py-2 text-slate-600">
                <button type="button" onClick={() => setOpenId(f.view.model.id)} className="font-medium text-slate-700 hover:text-indigo-700">
                  {f.view.model.name}
                </button>
                <span className="text-slate-500">{f.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <ModelDrawer view={open} onClose={() => setOpenId(null)} onRetryDetails={onRetryDetails} />
    </div>
  );
}
