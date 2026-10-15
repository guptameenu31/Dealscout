import type { ReactNode } from "react";
import { ChevronDown, CircleCheck, CircleHelp, ExternalLink, RotateCcw } from "lucide-react";
import type { RejectedListing } from "../api/types";
import { inr, offerLinkLabel, relativeTime } from "../lib/format";
import type { ModelView } from "../lib/useSearch";
import { BudgetBadge, StretchBadge } from "./badges";
import { Dialog } from "./Dialog";

const SKIP_LABEL: Record<RejectedListing["match"], string> = {
  exact: "Match",
  accessory: "Accessory",
  bundle: "Bundle",
  different_model: "Different model",
  used_or_refurbished: "Used / refurbished",
  other: "Not a normal listing",
  unchecked: "Not verified",
  price_outlier: "Implausible price",
};

export function ModelDrawer({ view, onClose, onRetryDetails }: { view: ModelView | null; onClose: () => void; onRetryDetails: (modelId: string) => void }) {
  return (
    <Dialog open={!!view} onClose={onClose} title={view?.model.name ?? "Model details"} variant="drawer">
      {view && <Body view={view} onRetryDetails={() => onRetryDetails(view.model.id)} />}
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Body({ view, onRetryDetails }: { view: ModelView; onRetryDetails: () => void }) {
  const { model, details, priced, noListing, priceStatus, rejected } = view;
  const d = details.data;
  return (
    <div className="space-y-6 p-5">
      <header className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {model.stretch && <StretchBadge />}
          {priced && <BudgetBadge item={priced} />}
        </div>
        {priced ? (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="tabular text-3xl font-semibold">{inr(priced.currentPrice)}</span>
            <span className="text-sm text-slate-500">lowest verified price · checked {relativeTime(priced.observedAt)}</span>
          </p>
        ) : (
          <p className="text-sm text-slate-500">
            {priceStatus === "loading" ? "Checking prices…" : priceStatus === "error" ? "Prices unavailable right now." : (noListing ?? "")}
          </p>
        )}
      </header>

      {priced && (
        <Section title="Where to buy">
          <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
            {priced.offers.map((o) => (
              <li key={o.store} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3.5 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{o.store}</span>
                  <span className="block truncate text-xs text-slate-400">{o.title}</span>
                </span>
                <span className="tabular font-semibold">{inr(o.price)}</span>
                <a href={o.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600">
                  {offerLinkLabel(o)} <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-400">Prices from Google Shopping listings in India. Verify on the retailer's site before buying.</p>
        </Section>
      )}

      {details.status === "loading" && <p className="text-sm text-slate-500">Researching this model…</p>}
      {details.status === "error" && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          Couldn't load the research for this model.
          <button type="button" onClick={onRetryDetails} className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Retry
          </button>
        </p>
      )}

      <Section title="Why it fits">
        <p className="text-sm text-slate-600">{d?.whyFits || model.why}</p>
      </Section>

      {d && (
        <>
          {d.mustHaveChecks.length > 0 && (
            <Section title="Your must-haves">
              <ul className="space-y-2">
                {d.mustHaveChecks.map((c) => (
                  <li key={c.req} className="flex gap-2 text-sm">
                    {c.result === "yes" ? (
                      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Confirmed" />
                    ) : (
                      <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-label="Not confirmed" />
                    )}
                    <span>
                      <span className="font-medium">{c.req}</span>
                      {c.evidence && <span className="text-slate-500"> · {c.evidence}</span>}
                      {c.result !== "yes" && <span className="text-slate-500"> · couldn't confirm, check the listing</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {d.keySpecs.length > 0 && (
            <Section title="Key specs">
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                {d.keySpecs.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </Section>
          )}
          {d.community && (
            <Section title="What reviewers and buyers say">
              <p className="text-sm text-slate-600">{d.community}</p>
            </Section>
          )}
          {d.concerns.length > 0 && (
            <Section title="Things to know">
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
                {d.concerns.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </Section>
          )}
          <p className="text-xs text-slate-400">Research by Gemini with Google Search; it may be incomplete.</p>
        </>
      )}

      {rejected.length > 0 && (
        <details className="group rounded-xl bg-slate-50 p-3.5 text-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-slate-700 focus-visible:outline-2 focus-visible:outline-indigo-600">
            {rejected.length} listing{rejected.length > 1 ? "s" : ""} skipped
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <ul className="mt-2 space-y-2">
            {rejected.map((r) => (
              <li key={r.candidateId} className="text-xs text-slate-600">
                <span className="font-semibold text-slate-700">{SKIP_LABEL[r.match]}</span> · {r.store}: {r.title}
                {r.reason && <span className="block text-slate-400">{r.reason}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
