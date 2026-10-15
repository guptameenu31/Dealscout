import { useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, RotateCcw } from "lucide-react";
import { ApiClientError } from "../api/errors";
import type { Step, StepStatus } from "../lib/useSearch";

interface Props {
  research: Step<unknown>;
  offers: Step<unknown>;
  validate: Step<unknown>;
  details: { status: StepStatus; done: number; failed: number; total: number; startedAt?: number; finishedAt?: number };
  onRetryResearch: () => void;
  onRetryOffers: () => void;
  onRetryValidate: () => void;
}

interface Row {
  label: string;
  hint: string;
  status: StepStatus;
  startedAt?: number;
  finishedAt?: number;
  error?: Error;
  onRetry?: () => void;
}

const notConfigured = (e?: Error) => e instanceof ApiClientError && e.code === "NOT_IMPLEMENTED";

function secs(from?: number, to?: number) {
  if (!from) return "";
  return `${Math.max(0, Math.round(((to ?? Date.now()) - from) / 1000))}s`;
}

/** Real progress: one row per pipeline step, each with its own status, time and retry. */
export function SearchProgress({ research, offers, validate, details, onRetryResearch, onRetryOffers, onRetryValidate }: Props) {
  const busy = [research.status, offers.status, validate.status, details.status].includes("loading");
  const [, tick] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const rows: Row[] = [
    { label: "Shortlisting models", hint: "Gemini + Google Search", ...research, onRetry: onRetryResearch },
    { label: "Checking prices at Indian stores", hint: "Google Shopping", ...offers, onRetry: onRetryOffers },
    { label: "Verifying listings", hint: "Skipping accessories, bundles and look-alikes", ...validate, onRetry: onRetryValidate },
    {
      label: `Researching each model${details.total ? ` (${details.done}/${details.total})` : ""}`,
      hint: details.failed ? `${details.failed} failed; retry on the card` : "Specs, must-haves, what reviewers say",
      status: details.status,
      startedAt: details.startedAt,
      finishedAt: details.finishedAt,
    },
  ];

  return (
    <div aria-live="polite" className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_6px_24px_rgba(80,70,160,0.06)]">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{busy ? "DealScout is working on it" : "Search steps"}</h2>
      <ol className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.hint} className="text-sm">
            <div className={`flex items-center gap-2.5 ${r.status === "idle" ? "text-slate-400" : "text-slate-800"}`}>
              {r.status === "done" ? (
                <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              ) : r.status === "loading" ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-600" aria-hidden />
              ) : r.status === "error" ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border border-slate-300" aria-hidden />
              )}
              <span className="font-medium">{r.label}</span>
              <span className="hidden text-slate-400 sm:inline">· {r.hint}</span>
              {r.status !== "idle" && <span className="tabular ml-auto text-xs text-slate-400">{secs(r.startedAt, r.finishedAt)}</span>}
            </div>
            {r.status === "error" && (
              <div role="alert" className="ml-6.5 mt-1.5 flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-rose-800">
                <span className="flex-1">
                  {notConfigured(r.error) ? "Live search isn't configured on this server." : (r.error?.message ?? "Something went wrong.")}
                </span>
                {r.onRetry && !notConfigured(r.error) && (
                  <button
                    type="button"
                    onClick={r.onRetry}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1 font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-rose-600"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Retry
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
