import { useState } from "react";
import { ChevronDown, HelpCircle, Loader2, Search, Sparkles, Wand2 } from "lucide-react";
import type { SpecResponse } from "../api/client";
import type { ScoutMode, WatchSpec } from "../api/types";
import { ChipList } from "./ChipList";
import { PageHeading } from "./PageHeading";

const MODES: { id: ScoutMode; label: string }[] = [
  { id: "auto", label: "Auto (recommended)" },
  { id: "live", label: "Live only" },
  { id: "seeded", label: "Demo data" },
];

interface Props {
  response: SpecResponse;
  loading: boolean;
  clarifying: boolean;
  error: string | null;
  onClarify: (answer: string) => void;
  onFind: (spec: WatchSpec, mode: ScoutMode) => void;
  onReset: () => void;
}

export function SpecStep({ response, loading, clarifying, error, onClarify, onFind, onReset }: Props) {
  const [spec, setSpec] = useState<WatchSpec>(response.spec);
  const [mode, setMode] = useState<ScoutMode>("auto");
  const [answer, setAnswer] = useState("");
  const gemini = response.via === "gemini";
  const set = <K extends keyof WatchSpec>(k: K, v: WatchSpec[K]) => setSpec((s) => ({ ...s, [k]: v }));
  const valid = spec.category.trim().length > 0 && spec.budget > 0;

  return (
    <section className="mx-auto max-w-3xl space-y-7">
      <PageHeading eyebrow="Step 02 — your watch spec" title="Here's what I understood" subtitle="Check it over. Nothing is searched until you press Find deals, and you can change anything." />

      <div className="space-y-6 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_6px_24px_rgba(80,70,160,0.06)] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-slate-500">
            “{response.spec.query}”
          </p>
          {gemini ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Understood by Gemini ✦
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              <Wand2 className="h-3.5 w-3.5" aria-hidden /> Basic parsing (AI unavailable)
            </span>
          )}
        </div>

        {response.spec.needsClarification && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4" role="group" aria-labelledby="clarify-q">
            <p id="clarify-q" className="flex items-start gap-2 text-sm font-medium text-amber-900">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {response.spec.clarificationQuestion ?? "Can you tell me a bit more?"}
            </p>
            <form
              className="mt-3 flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (answer.trim()) onClarify(answer.trim());
              }}
            >
              <label htmlFor="clarify-a" className="sr-only">
                Your answer
              </label>
              <input id="clarify-a" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" className="flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-300" />
              <button type="submit" disabled={!answer.trim() || clarifying} className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700">
                {clarifying && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Update
              </button>
            </form>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="category" className="mb-1 block text-sm font-medium text-slate-700">
              Category
            </label>
            <input id="category" value={spec.category} onChange={(e) => set("category", e.target.value)} className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200" />
          </div>
          <div>
            <label htmlFor="budget" className="mb-1 block text-sm font-medium text-slate-700">
              Budget
            </label>
            <div className="flex items-center rounded-xl border border-slate-300 bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-200">
              <span className="pl-3.5 text-sm text-slate-500" aria-hidden>
                ₹
              </span>
              <input
                id="budget"
                inputMode="numeric"
                value={spec.budget ? spec.budget.toLocaleString("en-IN") : ""}
                onChange={(e) => set("budget", Number(e.target.value.replace(/[^\d]/g, "")) || 0)}
                className="tabular w-full bg-transparent px-2 py-2.5 text-sm outline-none"
              />
            </div>
          </div>
        </div>

        <ChipList label="Must-haves" hint="Products without these are left out." kind="must" values={spec.mustHaves} onChange={(v) => set("mustHaves", v)} />
        <ChipList label="Nice-to-haves" hint="Used to rank, never to exclude." kind="nice" values={spec.niceToHaves} onChange={(v) => set("niceToHaves", v)} />
        <ChipList label="Excluded" hint="Products with these are left out." kind="excluded" values={spec.excluded} onChange={(v) => set("excluded", v)} />

        {response.warnings.length > 0 && (
          <ul className="space-y-1 text-xs text-slate-500">
            {response.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}

        <details className="group text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-slate-600 focus-visible:outline-2 focus-visible:outline-indigo-600">
            Advanced <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <fieldset className="mt-3">
            <legend className="mb-2 text-xs font-medium text-slate-500">Data source</legend>
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {MODES.map((m) => (
                <label key={m.id} className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-indigo-600 ${mode === m.id ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}>
                  <input type="radio" name="mode" value={m.id} checked={mode === m.id} onChange={() => setMode(m.id)} className="sr-only" />
                  {m.label}
                </label>
              ))}
            </div>
          </fieldset>
        </details>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => onFind(spec, mode)} disabled={!valid || loading} className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          <Search className="h-5 w-5" aria-hidden /> Find deals
        </button>
        <button type="button" onClick={onReset} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-600">
          Start over
        </button>
      </div>
    </section>
  );
}
