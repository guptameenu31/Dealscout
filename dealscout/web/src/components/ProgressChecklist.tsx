import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

const STEPS = ["Searching stores with Google Search…", "Reading prices…", "Checking price history…", "Spotting inflated discounts…"];

/** Advances on a timer. It is reassurance that work is happening, not real server progress. */
export function ProgressChecklist() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div aria-live="polite" className="space-y-6">
      <div className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_6px_24px_rgba(80,70,160,0.06)]">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">DealScout is working on it</h2>
        <ol className="space-y-2.5">
          {STEPS.map((s, i) => (
            <li key={s} className={`flex items-center gap-2.5 text-sm ${i > step ? "text-slate-400" : "text-slate-800"}`}>
              {i < step ? (
                <Check className="h-4 w-4 text-emerald-600" aria-hidden />
              ) : i === step ? (
                <Loader2 className="h-4 w-4 animate-spin text-indigo-600" aria-hidden />
              ) : (
                <span className="h-4 w-4 rounded-full border border-slate-300" aria-hidden />
              )}
              {s}
            </li>
          ))}
        </ol>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
        {[0, 1, 2].map((n) => (
          <div key={n} className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white p-5">
            <div className="h-4 w-1/3 rounded bg-slate-100" />
            <div className="mt-4 h-5 w-3/4 rounded bg-slate-100" />
            <div className="mt-6 h-8 w-1/2 rounded bg-slate-100" />
            <div className="mt-6 h-10 w-full rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
