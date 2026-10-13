import type { Fit, Product, WatchSpec } from "./types.ts";

const INPUTS = /(\d+)\s*(?:x\s*)?(?:xlr\s*|mic\s*|combo\s*)?inputs?/i;
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Number of inputs a list of feature strings promises, if any. */
export function countInputs(features: string[]): number | undefined {
  for (const f of features) {
    const m = f.match(INPUTS);
    if (m) return Number(m[1]);
  }
  return undefined;
}

/**
 * Does the feature list satisfy one hard requirement? Counts are "at least N"; everything
 * else is a loose substring match.
 */
export function satisfies(features: string[], requirement: string): boolean {
  const need = requirement.match(INPUTS);
  if (need) {
    const has = countInputs(features);
    return has !== undefined && has >= Number(need[1]);
  }
  return features.join(" | ").toLowerCase().includes(requirement.toLowerCase());
}

/** A product that satisfies the spec, with its price, for comparing fit against the alternatives. */
export interface Candidate {
  product: Product;
}

/**
 * Judge how well a product fits the need, not just whether it passes: extras you'd pay for but
 * don't need, nice-to-haves it covers or lacks, and what the closest exact fit costs.
 */
export function assessFit(product: Product, spec: WatchSpec, others: Product[]): Fit {
  const notes: string[] = [];
  let level: Fit["level"] = "exact";

  const wantInputs = spec.mustHaves.map((m) => m.match(INPUTS)).find(Boolean);
  const hasInputs = countInputs(product.features);
  let overkill = false;
  if (wantInputs && hasInputs !== undefined && hasInputs > Number(wantInputs[1])) {
    overkill = true;
    level = "more";
    const exact = others
      .filter((o) => o.id !== product.id && countInputs(o.features) === Number(wantInputs[1]))
      .sort((a, b) => a.currentPrice - b.currentPrice)[0];
    const extra = exact ? product.currentPrice - exact.currentPrice : 0;
    notes.push(
      `Has ${hasInputs} inputs and you asked for ${wantInputs[1]}.` +
        (exact && extra > 0 ? ` That is ${inr(extra)} more than ${exact.name}, which already covers your need.` : ""),
    );
  }

  const have = spec.niceToHaves.filter((n) => satisfies(product.features, n));
  const lack = spec.niceToHaves.filter((n) => !satisfies(product.features, n));
  if (have.length) notes.push(`Also has your nice-to-haves: ${have.join(", ")}.`);
  if (lack.length) {
    notes.push(`Missing nice-to-haves: ${lack.join(", ")}.`);
    if (level === "exact") level = "partial";
  }

  if (!notes.length && spec.mustHaves.length) notes.push(`Covers everything you asked for: ${spec.mustHaves.join(", ")}.`);

  const summary = level === "exact" ? "Matches your need" : level === "more" ? "More than you need" : "Partly matches";
  return { level, summary, notes, overkill };
}
