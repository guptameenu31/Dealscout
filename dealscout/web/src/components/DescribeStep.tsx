import { useState } from "react";
import type { KeyboardEvent } from "react";
import { ArrowRight, ArrowUpRight, Check, Filter, Loader2, ShieldCheck, Sparkles } from "lucide-react";

const EXAMPLES = [
  "Wireless earbuds with ANC for my metro commute, under ₹10k",
  "Robot vacuum with mopping and LiDAR for a 2BHK, under ₹25,000",
  "Laptop for college coding, 16GB RAM, under ₹60k",
];

interface Props {
  initial: string;
  loading: boolean;
  error: string | null;
  onSubmit: (request: string) => void;
}

/** Static illustration of a search result. It is a sample, and says so. */
function SampleResult() {
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden>
      <div className="absolute -left-4 top-6 z-10 flex -rotate-2 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-[0_8px_24px_rgba(34,40,62,0.08)]">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-600/10 text-emerald-700">
          <Check className="h-4 w-4" />
        </span>
        <span className="text-xs">
          <b className="block text-slate-900">Listings verified</b>
          <span className="text-slate-500">3 look-alikes skipped</span>
        </span>
      </div>

      <div className="mt-14 rotate-[1.5deg] rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(60,62,140,0.12)]">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
          <span>Best value pick</span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 normal-case tracking-normal">Within budget</span>
        </div>
        <p className="mt-4 text-sm font-semibold text-slate-800">Sony WF-C700N</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="tabular text-3xl font-extrabold tracking-tight">₹7,990</span>
          <span className="text-sm text-slate-500">at Myntra</span>
        </p>
        <p className="mt-0.5 text-xs text-slate-500">Also at TechCommerce.in ₹8,271 · LowestRate Shopping ₹8,799</p>
        <ul className="mt-4 flex flex-wrap gap-1.5 text-xs font-medium">
          <li className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
            <Check className="h-3.5 w-3.5" /> active noise cancellation
          </li>
          <li className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
            <Check className="h-3.5 w-3.5" /> true wireless
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">"Commuters love the fit and the ANC on trains; the case holds only one extra charge."</p>
      </div>

      <div className="absolute -bottom-5 right-0 z-10 flex rotate-1 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-[0_8px_24px_rgba(34,40,62,0.08)]">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-100 text-indigo-700">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <span className="text-xs">
          <b className="block text-slate-900">Real prices, checked live</b>
          <span className="text-slate-500">From Indian stores on Google Shopping</span>
        </span>
      </div>
      <p className="mt-10 text-xs text-slate-400">Sample card from a real search on Oct 15, 2026.</p>
    </div>
  );
}

export function DescribeStep({ initial, loading, error, onSubmit }: Props) {
  const [text, setText] = useState(initial);
  const ready = text.trim().length >= 5;

  const submit = () => {
    if (ready && !loading) onSubmit(text.trim());
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div>
      <section className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="inline-flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-100 text-indigo-600">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            Shopping, with a little more certainty
          </p>
          <h1 className="mt-6 text-[clamp(2.7rem,5.2vw,3.9rem)] font-extrabold leading-[1.04] tracking-[-0.045em] text-slate-900">
            Watch the need,
            <br />
            <span className="text-indigo-600">not the product.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-500">
            Tell us what you're looking for and what you can spend. We research the right models, check live prices at Indian stores, and show you what's actually worth it.
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-slate-600">
            <li className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden /> Real prices, never AI-made
            </li>
            <li className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-emerald-700" aria-hidden /> Accessories and look-alikes filtered out
            </li>
          </ul>

          <form
            className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_10px_34px_rgba(60,62,140,0.07)]"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label htmlFor="need" className="text-[15px] font-bold text-slate-900">
              What are you looking for?
            </label>
            <textarea
              id="need"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              rows={3}
              maxLength={500}
              placeholder="e.g. Wireless earbuds with noise cancellation for my daily metro commute, good battery, under ₹10,000"
              className="mt-3 w-full resize-none border-0 bg-transparent p-0 text-lg text-slate-900 outline-none placeholder:text-slate-400"
            />
            <div className="border-t border-slate-100 pt-1 text-right text-xs text-slate-400 tabular">{text.length}/500</div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-slate-500">
                <Sparkles className="h-4 w-4 text-indigo-500" aria-hidden /> Plain English works best
              </span>
              <button
                type="submit"
                disabled={!ready || loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-base font-bold text-white shadow-[0_6px_16px_rgba(99,101,216,0.3)] hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Gemini is reading your request…
                  </>
                ) : (
                  <>
                    Understand my need <ArrowRight className="h-5 w-5" aria-hidden />
                  </>
                )}
              </button>
            </div>
          </form>

          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2.5" aria-label="Examples">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Try an example</span>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setText(ex)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                {ex} <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              </button>
            ))}
          </div>
        </div>

        <SampleResult />
      </section>

      <div className="mt-16 flex flex-wrap items-center justify-between gap-4 text-sm text-slate-500">
        <p>
          Thoughtful buying starts with <b className="text-slate-700">better information.</b>
        </p>
        <ol className="flex items-center gap-3" aria-label="Steps">
          <li className="flex items-center gap-2 font-medium text-slate-700">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-100 text-xs font-bold text-indigo-700">01</span> Describe your need
          </li>
          <li aria-hidden className="w-10 border-t border-dashed border-slate-300" />
          <li className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">02</span> Review matches
          </li>
        </ol>
      </div>
    </div>
  );
}
