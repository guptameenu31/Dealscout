import { judge } from "./verdict.ts";
import type { PriceSource, Product, ScoredProduct, WatchSpec } from "./types.ts";

/** Does the product's feature list cover every hard requirement? Loose substring match. */
export function meetsMustHaves(features: string[], mustHaves: string[]): boolean {
  return missingMustHaves(features, mustHaves).length === 0;
}

/** Must-haves not found in the product's features (same loose substring rule as meetsMustHaves). */
export function missingMustHaves(features: string[], mustHaves: string[]): string[] {
  const hay = features.join(" | ").toLowerCase();
  return mustHaves.filter((m) => !hay.includes(m.toLowerCase()));
}

/** Excluded features the product has. */
export function excludedHits(features: string[], excluded: string[]): string[] {
  const hay = features.join(" | ").toLowerCase();
  return excluded.filter((x) => hay.includes(x.toLowerCase()));
}

export interface FilteredOut {
  product: Product;
  reason: string;
}

export interface ScoutResult {
  items: ScoredProduct[];
  /** Products the source found but we dropped, with the reason (shown to the user for transparency). */
  filteredOut: FilteredOut[];
}

/** Discover products, drop non-matches (with reasons), score each against its own price history. */
export async function scoutDetailed(spec: WatchSpec, source: PriceSource): Promise<ScoutResult> {
  const discovered = await source.discover(spec);
  const kept: Product[] = [];
  const filteredOut: FilteredOut[] = [];
  for (const p of discovered) {
    const missing = missingMustHaves(p.features, spec.mustHaves);
    const banned = excludedHits(p.features, spec.excluded ?? []);
    if (missing.length) filteredOut.push({ product: p, reason: `Missing: ${missing.join(", ")}` });
    else if (banned.length) filteredOut.push({ product: p, reason: `Has excluded feature: ${banned.join(", ")}` });
    else kept.push(p);
  }

  const scored = await Promise.all(
    kept.map(async (product) => {
      const history = await source.history(product);
      return { product, history, verdict: judge(product, history, spec) };
    }),
  );
  const rank = { buy_now: 0, wait: 1, skip: 2 } as const;
  scored.sort(
    (a, b) => rank[a.verdict.label] - rank[b.verdict.label] || b.verdict.realDiscountPct - a.verdict.realDiscountPct,
  );
  return { items: scored, filteredOut };
}

/** Discover products, score each against its own price history, best deals first. */
export async function scout(spec: WatchSpec, source: PriceSource): Promise<ScoredProduct[]> {
  return (await scoutDetailed(spec, source)).items;
}
