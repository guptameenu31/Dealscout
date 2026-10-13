import { z } from "zod";
import type { WatchSpec } from "./types.ts";

const MAX_BUDGET = 10_000_000; // ₹1 crore; anything above is almost certainly a parsing error
export const DEFAULT_BUDGET = 15_000;

const term = z.string().trim().min(1).max(80);
const termList = z
  .array(term)
  .max(15)
  .default([])
  .transform((xs) => {
    const seen = new Set<string>(); // case-insensitive dedupe, keeps the first spelling
    return xs.filter((x) => !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
  });

/** A complete, valid watch spec. Used for request bodies (the UI sends back an edited spec). */
export const WatchSpecSchema = z.object({
  query: z.string().trim().max(500).default(""),
  category: z.string().trim().min(1).max(80),
  budget: z.number().int().positive().max(MAX_BUDGET),
  currency: z.literal("INR").default("INR"),
  mustHaves: termList,
  niceToHaves: termList,
  excluded: termList,
  searchTerms: termList,
  needsClarification: z.boolean().default(false),
  clarificationQuestion: z.string().trim().max(300).nullable().default(null),
});

/** What we accept from Gemini: everything optional, wrong types dropped instead of failing. */
const GeminiSpecSchema = z.object({
  category: z.string().trim().max(80).optional().catch(undefined),
  budget: z.number().optional().catch(undefined),
  mustHaves: z.array(z.string()).optional().catch(undefined),
  niceToHaves: z.array(z.string()).optional().catch(undefined),
  excluded: z.array(z.string()).optional().catch(undefined),
  searchTerms: z.array(z.string()).optional().catch(undefined),
  needsClarification: z.boolean().optional().catch(undefined),
  clarificationQuestion: z.string().optional().nullable().catch(undefined),
});

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
/** Trim, drop empties, and cap sizes so the final schema check cannot fail on AI verbosity. */
const clean = (xs: string[] | undefined) =>
  (xs ?? []).map((x) => x.trim().slice(0, 80)).filter(Boolean).slice(0, 15);

/**
 * Turn untrusted AI output into a valid WatchSpec.
 * Rule from the product spec: never silently change the user's stated budget.
 */
export function normalizeSpec(
  query: string,
  raw: unknown,
  statedBudget: number | undefined,
): { spec: WatchSpec; warnings: string[] } {
  const warnings: string[] = [];
  const g = GeminiSpecSchema.safeParse(raw ?? {});
  const r = g.success ? g.data : {};

  let budget: number;
  if (statedBudget !== undefined) {
    budget = statedBudget;
    if (r.budget !== undefined && Math.round(r.budget) !== Math.round(statedBudget)) {
      warnings.push(`Kept your stated budget of ${inr(statedBudget)} (AI suggested ${inr(r.budget)}).`);
    }
  } else if (r.budget !== undefined && r.budget > 0 && r.budget <= MAX_BUDGET) {
    budget = r.budget;
    warnings.push(`No budget found in your request; using ${inr(budget)}. Edit it if that's wrong.`);
  } else {
    budget = DEFAULT_BUDGET;
    warnings.push(`No budget found in your request; assumed ${inr(budget)}. Edit it before searching.`);
  }

  const category = r.category?.trim().slice(0, 80) || "product";
  const searchTerms = clean(r.searchTerms);
  const candidate = {
    query: query.slice(0, 500),
    category,
    budget: Math.round(budget),
    currency: "INR" as const,
    mustHaves: clean(r.mustHaves),
    niceToHaves: clean(r.niceToHaves),
    excluded: clean(r.excluded),
    searchTerms: searchTerms.length ? searchTerms : [category],
    needsClarification: r.needsClarification ?? false,
    clarificationQuestion: r.needsClarification ? (r.clarificationQuestion?.trim().slice(0, 300) || null) : null,
  };
  // Final gate: same schema the API uses for request bodies (trims, dedupes, caps list sizes).
  return { spec: WatchSpecSchema.parse(candidate), warnings };
}
