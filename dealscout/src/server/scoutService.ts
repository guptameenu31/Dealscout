import { randomUUID } from "node:crypto";
import { evaluateMustHaves, scoutDetailed, type ScoutResult } from "../scout.ts";
import { computeStats } from "../stats.ts";
import type { PriceSource, ScoredProduct, WatchSpec } from "../types.ts";
import type { ApiPricePoint, Provenance, ScoredItem, ScoutMode, ScoutResponse } from "./apiTypes.ts";
import { AppError } from "./errors.ts";
import type { ResultCache } from "./resultCache.ts";

export interface ScoutDeps {
  /** Creates the live source for one run; null when live search is not configured. */
  liveSource: ((signal: AbortSignal) => PriceSource) | null;
  seededSource: () => PriceSource;
  cache: ResultCache;
  liveTimeoutMs: number;
  /** Called after every live attempt (e.g. to persist price history). */
  afterLive?: () => void;
}

const MIN_CONFIDENT_HISTORY = 14;

/** Human-readable limitations for one product. The UI must show these next to the data. */
function dataNotes(provenance: Provenance, history: ApiPricePoint[]): string[] {
  const notes: string[] = [];
  const stats = computeStats(history);
  if (provenance === "seeded") notes.push("Demo product: listing and store link are placeholders, not a real offer.");
  if (!stats) {
    notes.push("No price history yet; DealScout starts tracking from today.");
    return notes;
  }
  if (stats.seededCount === stats.count) {
    notes.push(`All ${stats.count} price points are synthetic demo data, not real observations.`);
  } else if (stats.seededCount > 0) {
    notes.push(`${stats.seededCount} of ${stats.count} price points are synthetic demo data.`);
  }
  notes.push(`Observation window: ${stats.firstDate} to ${stats.lastDate} (${stats.days} days, ${stats.count} observations).`);
  if (stats.count < MIN_CONFIDENT_HISTORY) notes.push("Short history: verdict confidence is limited.");
  return notes;
}

/** Notes from live discovery: Gemini's requirement evidence and whether the link matched Google's sources. */
function discoveryNotes(sp: ScoredProduct, spec: WatchSpec): string[] {
  const notes: string[] = [];
  const p = sp.product;
  if (p.linkInSources === false) notes.push("Store link was not among Google Search's sources; verify it before buying.");
  for (const c of p.mustHaveChecks ?? []) {
    if (c.met === "yes") notes.push(`Meets "${c.requirement}"${c.evidence ? `: "${c.evidence}"` : ""} (checked by Gemini).`);
  }
  const { unconfirmed } = evaluateMustHaves(p, spec.mustHaves);
  if (unconfirmed.length) notes.push(`Could not confirm: ${unconfirmed.join(", ")}. Check the listing.`);
  return notes;
}

function toItem(sp: ScoredProduct, provenance: Provenance, now: string, spec: WatchSpec): ScoredItem {
  const history: ApiPricePoint[] = sp.history.map((h) => ({
    date: h.date,
    price: h.price,
    provenance: h.provenance ?? "live",
  }));
  return {
    product: {
      id: sp.product.id,
      name: sp.product.name,
      store: sp.product.store,
      url: sp.product.url,
      currentPrice: sp.product.currentPrice,
      claimedOriginal: sp.product.claimedOriginal ?? null,
      features: sp.product.features,
      observedAt: sp.product.observedAt ?? now,
    },
    history,
    stats: computeStats(history),
    verdict: sp.verdict,
    dataNotes: [...discoveryNotes(sp, spec), ...dataNotes(provenance, history)],
  };
}

export function toResponse(
  spec: WatchSpec,
  result: ScoutResult,
  provenance: Provenance,
  fallbackReason: string | null,
): ScoutResponse {
  const now = new Date().toISOString();
  return {
    runId: randomUUID(),
    generatedAt: now,
    provenance,
    fallbackReason,
    cachedAt: null,
    spec,
    items: result.items.map((i) => toItem(i, provenance, now, spec)),
    filteredOut: result.filteredOut.map((f) => ({ name: f.product.name, store: f.product.store, reason: f.reason })),
  };
}

/** Reverse of toItem, for rendering the email digest from an API response. */
export function toScoredProducts(res: ScoutResponse): ScoredProduct[] {
  return res.items.map((i) => ({
    product: { ...i.product, claimedOriginal: i.product.claimedOriginal ?? undefined },
    history: i.history,
    verdict: i.verdict,
  }));
}

function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error(`timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
  });
  return Promise.race([work(ctrl.signal), timeout]).finally(() => clearTimeout(timer));
}

const shortMessage = (err: unknown) => String((err as Error)?.message ?? err).slice(0, 200);

/**
 * Find and judge products for a spec.
 *   seeded: demo data only.
 *   live:   live search only; errors if it fails.
 *   auto:   live → last cached live result for this need → seeded demo data.
 * The response always says which one was used (provenance) and why we fell back (fallbackReason).
 */
export async function runScout(spec: WatchSpec, mode: ScoutMode, deps: ScoutDeps): Promise<ScoutResponse> {
  const seeded = async (reason: string | null) =>
    toResponse(spec, await scoutDetailed(spec, deps.seededSource()), "seeded", reason);

  const fallback = async (reason: string): Promise<ScoutResponse> => {
    const cached = deps.cache.get(spec);
    if (cached) {
      return {
        ...cached,
        runId: randomUUID(),
        generatedAt: new Date().toISOString(),
        provenance: "cached",
        cachedAt: cached.generatedAt,
        fallbackReason: reason,
        spec,
      };
    }
    return seeded(reason);
  };

  if (mode === "seeded") return seeded(null);

  const makeLive = deps.liveSource;
  if (!makeLive) {
    const reason = "Live search is not configured on this server.";
    if (mode === "live") throw new AppError(502, "UPSTREAM_ERROR", reason);
    return fallback(reason);
  }

  let result: ScoutResult;
  try {
    result = await withTimeout((signal) => scoutDetailed(spec, makeLive(signal)), deps.liveTimeoutMs);
  } catch (err) {
    const reason = `Live search failed: ${shortMessage(err)}`;
    console.warn(reason);
    if (mode === "live") throw new AppError(502, "UPSTREAM_ERROR", reason);
    return fallback(reason);
  } finally {
    deps.afterLive?.();
  }

  const response = toResponse(spec, result, "live", null);
  if (response.items.length === 0 && mode === "auto") {
    return fallback("Live search found no products matching your must-haves.");
  }
  if (response.items.length > 0) deps.cache.set(spec, response);
  return response;
}
