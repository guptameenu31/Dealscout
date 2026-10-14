import { useMemo, useState } from "react";
import { Bell, ChevronDown, ChevronLeft, Mail, PackageSearch, SearchX } from "lucide-react";
import type { ScoredItem, ScoutResponse, VerdictLabel } from "../api/types";
import { inr } from "../lib/format";
import { DigestModal } from "./DigestModal";
import { ProductCard } from "./ProductCard";
import { ProductDrawer } from "./ProductDrawer";
import { ProvenanceBanner } from "./ProvenanceBanner";
import { WatchModal } from "./WatchModal";

type Tab = "all" | VerdictLabel;

interface Props {
  result: ScoutResponse;
  onBack?: () => void;
  onTryLive?: () => void;
  retrying?: boolean;
  /** Hide the digest/watch actions, e.g. when viewing a saved watch. */
  hideActions?: boolean;
}

export function Results({ result, onBack, onTryLive, retrying, hideActions }: Props) {
  const [tab, setTab] = useState<Tab>("all");
  const [open, setOpen] = useState<ScoredItem | null>(null);
  const [digest, setDigest] = useState(false);
  const [watch, setWatch] = useState(false);

  const counts = useMemo(() => {
    const c = { all: result.items.length, buy_now: 0, wait: 0, skip: 0 };
    for (const i of result.items) c[i.verdict.label]++;
    return c;
  }, [result.items]);
  const inflated = result.items.filter((i) => i.verdict.fakeDiscount).length;
  const shown = tab === "all" ? result.items : result.items.filter((i) => i.verdict.label === tab);
  const { spec } = result;

  const tabs: { id: Tab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "buy_now", label: "Buy now" },
    { id: "wait", label: "Wait" },
    { id: "skip", label: "Over budget" },
  ];

  return (
    <div className="space-y-5">
      <ProvenanceBanner result={result} onTryLive={onTryLive} retrying={retrying} />

      {result.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <SearchX className="mx-auto h-10 w-10 text-slate-400" aria-hidden />
          <p className="mt-3 font-medium">No matches under {inr(spec.budget)}</p>
          <p className="mt-1 text-sm text-slate-500">Try raising the budget or removing a must-have.</p>
          {onBack && (
            <button type="button" onClick={onBack} className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
              <ChevronLeft className="h-4 w-4" aria-hidden /> Back to your spec
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex w-full flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl border border-slate-200 bg-white px-5 py-4" aria-live="polite">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-100 text-indigo-600" aria-hidden>
                  <PackageSearch className="h-5 w-5" />
                </span>
                <p>
                  <strong className="block font-bold text-slate-900">
                    {counts.all - counts.skip} match{counts.all - counts.skip === 1 ? "" : "es"} within budget
                  </strong>
                  <span className="text-sm text-slate-500">
                    Plus {counts.skip} over budget · based on your requirements
                  </span>
                </p>
              </div>
              <dl className="ml-auto flex gap-8 text-center">
                <div>
                  <dd className="text-2xl font-extrabold text-emerald-700 tabular">{counts.buy_now}</dd>
                  <dt className="text-xs text-slate-500">Buy now</dt>
                </div>
                <div>
                  <dd className={`text-2xl font-extrabold tabular ${inflated ? "text-rose-700" : "text-slate-400"}`}>{inflated}</dd>
                  <dt className="text-xs text-slate-500">Inflated discounts</dt>
                </div>
                <div>
                  <dd className="text-2xl font-extrabold text-slate-400 tabular">{counts.skip}</dd>
                  <dt className="text-xs text-slate-500">Over budget</dt>
                </div>
              </dl>
            </div>
            {onBack && (
              <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                <ChevronLeft className="h-4 w-4" aria-hidden /> Edit your watch spec
              </button>
            )}
          </div>

          <div role="tablist" aria-label="Filter results" className="flex flex-wrap gap-6 border-b border-slate-200">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 px-0.5 pb-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
                  tab === t.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.label} <span className="tabular ml-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{counts[t.id]}</span>
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">Nothing in this group.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((item, i) => (
                <ProductCard key={item.product.id} item={item} index={i} onOpen={() => setOpen(item)} />
              ))}
            </div>
          )}
        </>
      )}

      {result.filteredOut.length > 0 && (
        <details className="group rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-slate-700 focus-visible:outline-2 focus-visible:outline-indigo-600">
            {result.filteredOut.length} product{result.filteredOut.length > 1 ? "s" : ""} didn't meet your must-haves
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="mt-3 divide-y divide-slate-100">
            {result.filteredOut.map((f) => (
              <li key={`${f.store}-${f.name}`} className="flex flex-wrap justify-between gap-x-4 py-2 text-slate-600">
                <span>
                  {f.name} <span className="text-slate-400">· {f.store}</span>
                </span>
                <span className="text-slate-500">{f.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {!hideActions && result.items.length > 0 && (
        <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <button type="button" onClick={() => setDigest(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
            <Mail className="h-4 w-4" aria-hidden /> Email me this digest
          </button>
          <button type="button" onClick={() => setWatch(true)} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
            <Bell className="h-4 w-4" aria-hidden /> Watch this need
          </button>
        </div>
      )}

      <ProductDrawer item={open} onClose={() => setOpen(null)} />
      <DigestModal open={digest} onClose={() => setDigest(false)} spec={spec} />
      <WatchModal open={watch} onClose={() => setWatch(false)} spec={spec} />
    </div>
  );
}
