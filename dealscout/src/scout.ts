import { assessFit, satisfies } from "./fit.ts";
import { judge } from "./verdict.ts";
import type { PriceSource, ScoredProduct, WatchSpec } from "./types.ts";

export type TraceKind = "info" | "good" | "warn" | "skip";
export interface TraceEvent {
  kind: TraceKind;
  text: string;
}

/** Hard requirements the product's feature list doesn't cover. Input counts mean "at least N". */
export function missingMustHaves(features: string[], mustHaves: string[]): string[] {
  return mustHaves.filter((m) => !satisfies(features, m));
}

export const meetsMustHaves = (features: string[], mustHaves: string[]) => missingMustHaves(features, mustHaves).length === 0;

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/**
 * Discover products, score each against its own price history, best deals first.
 * `onEvent` receives a running trace of what the agent is doing, for the UI.
 */
export async function scout(
  spec: WatchSpec,
  source: PriceSource,
  onEvent: (e: TraceEvent) => void = () => {},
): Promise<ScoredProduct[]> {
  return (await scoutDetailed(spec, source, onEvent)).items;
}

export interface FilteredOut {
  name: string;
  store: string;
  reason: string;
}

/** Like scout(), but also reports the products that were found and ruled out, with reasons. */
export async function scoutDetailed(
  spec: WatchSpec,
  source: PriceSource,
  onEvent: (e: TraceEvent) => void = () => {},
): Promise<{ items: ScoredProduct[]; filteredOut: FilteredOut[] }> {
  const filteredOut: FilteredOut[] = [];
  onEvent({ kind: "info", text: `Searching stores for "${spec.category}" under ${inr(spec.budget)}…` });
  const found = await source.discover(spec);
  const stores = [...new Set(found.map((p) => p.store))];
  onEvent({ kind: "info", text: `Found ${found.length} products across ${stores.length} stores: ${stores.join(", ")}` });

  const products = [];
  for (const p of found) {
    const missing = missingMustHaves(p.features, spec.mustHaves);
    const hay = p.features.join(" | ").toLowerCase();
    const unwanted = (spec.excluded ?? []).filter((x) => x && hay.includes(x.toLowerCase()));
    if (missing.length) {
      onEvent({ kind: "skip", text: `Ruled out ${p.name}: missing ${missing.join(", ")}` });
      filteredOut.push({ name: p.name, store: p.store, reason: `Missing: ${missing.join(", ")}` });
    } else if (unwanted.length) {
      onEvent({ kind: "skip", text: `Ruled out ${p.name}: has ${unwanted.join(", ")}, which you excluded` });
      filteredOut.push({ name: p.name, store: p.store, reason: `Has excluded feature: ${unwanted.join(", ")}` });
    } else products.push(p);
  }

  const scored: ScoredProduct[] = [];
  for (const product of products) {
    const history = await source.history(product);
    const verdict = judge(product, history, spec);
    const fit = assessFit(product, spec, products);
    scored.push({ product, history, verdict, fit });
    const days = history.length ? `${history.length} days of price history` : "no price history yet";
    onEvent({ kind: "info", text: `Checked ${product.name}: ${days}` });
    if (verdict.fakeDiscount) {
      onEvent({ kind: "warn", text: `Fake discount caught on ${product.name}: ${verdict.claimedDiscountPct}% off claimed, ${Math.max(verdict.realDiscountPct, 0)}% real` });
    }
    if (fit.overkill) onEvent({ kind: "warn", text: `${product.name}: more than you need. ${fit.notes[0]}` });
    if (verdict.label === "buy_now") onEvent({ kind: "good", text: `${product.name}: buy now. ${verdict.reasons.at(-1)}` });
  }

  const rank = { buy_now: 0, wait: 1, skip: 2 } as const;
  const sorted = scored.sort(
    (a, b) => rank[a.verdict.label] - rank[b.verdict.label] || b.verdict.realDiscountPct - a.verdict.realDiscountPct,
  );
  const buy = sorted.filter((s) => s.verdict.label === "buy_now").length;
  onEvent({ kind: "good", text: `Done. ${buy} to buy now, ${sorted.length - buy} to wait on or skip.` });
  return { items: sorted, filteredOut };
}
