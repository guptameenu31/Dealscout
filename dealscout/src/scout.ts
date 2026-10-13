import { judge } from "./verdict.ts";
import type { PriceSource, ScoredProduct, WatchSpec } from "./types.ts";

/** Does the product's feature list cover every hard requirement? Loose substring match. */
export function meetsMustHaves(features: string[], mustHaves: string[]): boolean {
  const hay = features.join(" | ").toLowerCase();
  return mustHaves.every((m) => hay.includes(m.toLowerCase()));
}

/** Discover products, score each against its own price history, best deals first. */
export async function scout(spec: WatchSpec, source: PriceSource): Promise<ScoredProduct[]> {
  const products = (await source.discover(spec)).filter((p) => meetsMustHaves(p.features, spec.mustHaves));
  const scored = await Promise.all(
    products.map(async (product) => {
      const history = await source.history(product);
      return { product, history, verdict: judge(product, history, spec) };
    }),
  );
  const rank = { buy_now: 0, wait: 1, skip: 2 } as const;
  return scored.sort(
    (a, b) => rank[a.verdict.label] - rank[b.verdict.label] || b.verdict.realDiscountPct - a.verdict.realDiscountPct,
  );
}
