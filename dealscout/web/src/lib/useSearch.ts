import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { offers as fetchOffers, research, researchDetails, validate as fetchValidate } from "../api/client";
import type { ModelDetails, OffersResponse, RejectedListing, ResearchResponse, ShortlistModel, ValidateResponse, ValidatedItem, WatchSpec } from "../api/types";

/**
 * Runs the search pipeline and owns its state:
 *   research → (details for each model, one request each) ∥ (offers → validate)
 * Each step can be retried on its own; cancel() aborts everything in flight (edit spec, start over, new search).
 */

export type StepStatus = "idle" | "loading" | "done" | "error";

export interface Step<T> {
  status: StepStatus;
  data?: T;
  error?: Error;
  startedAt?: number;
  finishedAt?: number;
}

interface SearchState {
  spec: WatchSpec | null;
  research: Step<ResearchResponse>;
  offers: Step<OffersResponse>;
  validate: Step<ValidateResponse>;
  details: Record<string, Step<ModelDetails>>;
  /** modelId → reason, from details: a must-have is not met. */
  mustHaveFailed: Record<string, string>;
}

const idle = { status: "idle" as const };
const INITIAL: SearchState = { spec: null, research: idle, offers: idle, validate: idle, details: {}, mustHaveFailed: {} };

const loading = <T,>(): Step<T> => ({ status: "loading", startedAt: Date.now() });
const done = <T,>(prev: Step<T>, data: T): Step<T> => ({ status: "done", data, startedAt: prev.startedAt, finishedAt: Date.now() });
const failed = <T,>(prev: Step<T>, error: unknown): Step<T> => ({
  status: "error",
  error: error instanceof Error ? error : new Error(String(error)),
  startedAt: prev.startedAt,
  finishedAt: Date.now(),
});

/** One model as the UI shows it: shortlist + details + price, merged. */
export interface ModelView {
  model: ShortlistModel;
  details: Step<ModelDetails>;
  /** Price state for this card: loading until validate returns; error if offers or validate failed. */
  priceStatus: StepStatus;
  priced: ValidatedItem | null;
  /** Set when validation found no matching listing for this model. */
  noListing: string | null;
  rejected: RejectedListing[];
}

export function useSearch() {
  const [state, setState] = useState<SearchState>(INITIAL);
  const stateRef = useRef(state); // read by retry callbacks, which run on click (after commit)
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const ctrl = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    ctrl.current?.abort();
    ctrl.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);

  /** Runs `work` only if this run hasn't been cancelled since; ignores results from cancelled runs. */
  const live = (signal: AbortSignal) => (fn: () => void) => {
    if (!signal.aborted) fn();
  };

  const runValidate = useCallback(async (spec: WatchSpec, models: ShortlistModel[], o: OffersResponse, signal: AbortSignal) => {
    const ifLive = live(signal);
    setState((s) => ({ ...s, validate: loading() }));
    try {
      const v = await fetchValidate(spec, models, o.results.flatMap((r) => r.candidates), signal);
      ifLive(() => setState((s) => ({ ...s, validate: done(s.validate, v) })));
    } catch (e) {
      ifLive(() => setState((s) => ({ ...s, validate: failed(s.validate, e) })));
    }
  }, []);

  const runOffers = useCallback(
    async (spec: WatchSpec, models: ShortlistModel[], signal: AbortSignal) => {
      const ifLive = live(signal);
      setState((s) => ({ ...s, offers: loading(), validate: idle }));
      let o: OffersResponse;
      try {
        o = await fetchOffers(spec, models, signal);
      } catch (e) {
        ifLive(() => setState((s) => ({ ...s, offers: failed(s.offers, e) })));
        return;
      }
      ifLive(() => setState((s) => ({ ...s, offers: done(s.offers, o) })));
      if (!signal.aborted) await runValidate(spec, models, o, signal);
    },
    [runValidate],
  );

  const runDetails = useCallback(async (spec: WatchSpec, model: ShortlistModel, signal: AbortSignal) => {
    const ifLive = live(signal);
    setState((s) => ({ ...s, details: { ...s.details, [model.id]: loading() } }));
    try {
      const r = await researchDetails(spec, model, signal);
      const d = r.details.find((x) => x.modelId === model.id);
      if (!d || "error" in d) throw new Error(d && "error" in d ? d.error : "No details returned");
      const fail = r.filteredOut.find((f) => f.modelId === model.id);
      ifLive(() =>
        setState((s) => ({
          ...s,
          details: { ...s.details, [model.id]: done(s.details[model.id] ?? idle, d) },
          mustHaveFailed: fail ? { ...s.mustHaveFailed, [model.id]: fail.reason } : s.mustHaveFailed,
        })),
      );
    } catch (e) {
      ifLive(() => setState((s) => ({ ...s, details: { ...s.details, [model.id]: failed(s.details[model.id] ?? idle, e) } })));
    }
  }, []);

  const start = useCallback(
    async (spec: WatchSpec) => {
      cancel();
      const c = new AbortController();
      ctrl.current = c;
      const ifLive = live(c.signal);
      setState({ ...INITIAL, spec, research: loading() });
      let r: ResearchResponse;
      try {
        r = await research(spec, c.signal);
      } catch (e) {
        ifLive(() => setState((s) => ({ ...s, research: failed(s.research, e) })));
        return;
      }
      if (c.signal.aborted) return;
      setState((s) => ({ ...s, research: done(s.research, r) }));
      for (const m of r.models) void runDetails(spec, m, c.signal);
      void runOffers(spec, r.models, c.signal);
    },
    [cancel, runDetails, runOffers],
  );

  /** The current run's signal, or a fresh one if the run finished (retries after completion). */
  const signal = () => {
    if (!ctrl.current || ctrl.current.signal.aborted) ctrl.current = new AbortController();
    return ctrl.current.signal;
  };

  const retryResearch = useCallback(() => {
    const spec = stateRef.current.spec;
    if (spec) void start(spec);
  }, [start]);

  const retryOffers = useCallback(() => {
    const { spec, research: r } = stateRef.current;
    if (spec && r.data) void runOffers(spec, r.data.models, signal());
  }, [runOffers]);

  const retryValidate = useCallback(() => {
    const { spec, research: r, offers: o } = stateRef.current;
    if (spec && r.data && o.data) void runValidate(spec, r.data.models, o.data, signal());
  }, [runValidate]);

  const retryDetails = useCallback(
    (modelId: string) => {
      const { spec, research: r } = stateRef.current;
      const m = r.data?.models.find((x) => x.id === modelId);
      if (spec && m) void runDetails(spec, m, signal());
    },
    [runDetails],
  );

  const reset = useCallback(() => {
    cancel();
    setState(INITIAL);
  }, [cancel]);

  const views = useMemo(() => buildViews(state), [state]);

  return { state, ...views, start, cancel, reset, retryResearch, retryOffers, retryValidate, retryDetails };
}

function buildViews(state: SearchState) {
  const models = state.research.data?.models ?? [];
  const v = state.validate.data;
  const priceStatus: StepStatus =
    state.offers.status === "error" || state.validate.status === "error"
      ? "error"
      : state.validate.status === "done"
        ? "done"
        : models.length
          ? "loading"
          : "idle";

  const all: ModelView[] = models.map((model) => ({
    model,
    details: state.details[model.id] ?? idle,
    priceStatus,
    priced: v?.items.find((i) => i.modelId === model.id) ?? null,
    noListing: v?.filteredOut.find((f) => f.modelId === model.id)?.reason ?? null,
    rejected: v?.rejected.filter((x) => x.modelId === model.id) ?? [],
  }));

  const failedMustHave = all
    .filter((m) => state.mustHaveFailed[m.model.id])
    .map((m) => ({ view: m, reason: state.mustHaveFailed[m.model.id] }));
  const shown = all.filter((m) => !state.mustHaveFailed[m.model.id]);

  // Once prices are in: priced models in the server's order (within budget first, then cheapest), then unpriced ones.
  if (v) {
    const order = new Map(v.items.map((i, idx) => [i.modelId, idx]));
    shown.sort((a, b) => (order.get(a.model.id) ?? 99) - (order.get(b.model.id) ?? 99));
  }
  const priced = shown.filter((m) => m.priced);
  return {
    models: shown,
    failedMustHave,
    counts: {
      withinBudget: priced.filter((m) => m.priced!.withinBudget).length,
      overBudget: priced.filter((m) => !m.priced!.withinBudget).length,
      noListing: shown.filter((m) => m.noListing).length,
      detailsDone: models.filter((m) => state.details[m.id]?.status === "done").length,
      detailsFailed: models.filter((m) => state.details[m.id]?.status === "error").length,
      total: models.length,
    },
  };
}
