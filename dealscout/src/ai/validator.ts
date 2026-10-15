import { dropPriceOutliers, pickOffers, type Candidate } from "../sources/serper.ts";
import type { WatchSpec } from "../types.ts";
import type { StepModel, TextGenerator } from "./generator.ts";

/**
 * Validator step: Gemini looks at the n models × top-k Serper listings and says, per listing ID, whether it is
 * that exact model sold new on its own (not an accessory, bundle, sibling model or refurb). It cannot add
 * listings or change prices: verdicts only reference candidate IDs, and every ₹ figure is computed here.
 */

/** The validated model as the client sends it back (from the research shortlist). */
export interface PricedModel {
  id: string;
  name: string;
  stretch: boolean;
}

export type ListingMatch = "exact" | "accessory" | "bundle" | "different_model" | "used_or_refurbished" | "other";
const MATCHES: ListingMatch[] = ["exact", "accessory", "bundle", "different_model", "used_or_refurbished", "other"];

export interface Verdict {
  id: string;
  match: ListingMatch;
  reason: string;
}

export interface ApiOffer {
  store: string;
  title: string;
  /** Rupees (may have paise as decimals). */
  price: number;
  link: string;
  linkType: "shopping" | "search";
  googleProductId: string | null;
}

export interface ValidatedItem {
  modelId: string;
  name: string;
  stretch: boolean;
  /** Cheapest accepted offer, rupees. */
  currentPrice: number;
  offers: ApiOffer[];
  priceSource: "serper_google_shopping";
  observedAt: string;
  withinBudget: boolean;
  /** Rupees over budget (code-computed), null when within budget. */
  overBudgetBy: number | null;
  googleProductId: string | null;
  imageUrl: string | null;
}

export interface RejectedListing {
  candidateId: string;
  modelId: string;
  title: string;
  store: string;
  match: ListingMatch | "unchecked" | "price_outlier";
  reason: string;
}

export interface ValidationResult {
  /** Within budget first, then cheapest first. */
  items: ValidatedItem[];
  filteredOut: { modelId: string; name: string; reason: string }[];
  rejected: RejectedListing[];
}

export const NO_MATCH_REASON = "No matching Indian Google Shopping listing found";
export const OUTLIER_REASON = "Far below other stores' prices for this model";
export const HIGH_OUTLIER_REASON = "Far above other stores' prices for this model";

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Listing ID, copied exactly" },
          match: { type: "string", enum: MATCHES },
          reason: { type: "string", description: "Short reason, max 15 words; no prices" },
        },
        required: ["id", "match", "reason"],
      },
    },
  },
  required: ["verdicts"],
};

const rupees = (paise: number) => paise / 100;
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Ask Gemini for one verdict per candidate. Throws on Gemini errors, timeouts and invalid JSON. */
export async function judgeListings(
  spec: WatchSpec,
  models: { id: string; name: string }[],
  candidates: Candidate[],
  generator: TextGenerator,
  step: StepModel,
  signal?: AbortSignal,
): Promise<Verdict[]> {
  if (!candidates.length) return [];
  const blocks = models
    .map((m) => {
      const rows = candidates.filter((c) => c.modelId === m.id);
      if (!rows.length) return "";
      return `MODEL "${m.name}"\n${rows.map((c) => `- ${c.id} | ${c.title} | ${c.store} | ${inr(rupees(c.pricePaise))}`).join("\n")}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const res = await generator.generate({
    ...step,
    jsonSchema: VERDICT_SCHEMA,
    signal,
    prompt: `Today is ${new Date().toISOString().slice(0, 10)}. A shopper in India is looking for: ${spec.category}. Below are Google Shopping listings found for each researched model.
For EVERY listing ID, decide whether the listing is that exact model, sold new as the main product:
- exact: the same model (a different colour, or a bundle of only free minor in-box items, is fine)
- accessory: a part, case, mount, cable, cover or other add-on for the model, not the model itself
- bundle: the model sold together with other significant products (e.g. "studio pack", "with microphone")
- different_model: a sibling or different model, size, capacity or generation than the one named
- used_or_refurbished: used, refurbished, renewed or open-box
- other: anything else that is not a normal listing of the model
Use the price only as a hint (a price far below the others often means an accessory). Do not output prices.

${blocks}`,
  });

  let raw: unknown;
  try {
    raw = JSON.parse(res.text);
  } catch {
    throw new Error("Validator returned invalid JSON");
  }
  const rows = (raw as { verdicts?: unknown })?.verdicts;
  if (!Array.isArray(rows)) throw new Error("Validator returned no verdicts");
  return rows.flatMap((r: any): Verdict[] =>
    typeof r?.id === "string" && MATCHES.includes(r?.match)
      ? [{ id: r.id, match: r.match, reason: String(r.reason ?? "").replace(/₹\s?[\d,.]+/g, "").trim().slice(0, 160) }]
      : [],
  );
}

/**
 * Apply verdicts in code. Unknown IDs are ignored; listings without a verdict are rejected (fail closed);
 * accepted listings priced far below (or far above) the model's other offers are rejected as price outliers.
 * Prices, cheapest offer and budget maths come from the Serper candidates, never from the model.
 */
export function applyVerdicts(spec: WatchSpec, models: PricedModel[], candidates: Candidate[], verdicts: Verdict[]): ValidationResult {
  const byId = new Map<string, Verdict>();
  for (const v of verdicts) if (!byId.has(v.id)) byId.set(v.id, v);

  const items: ValidatedItem[] = [];
  const filteredOut: ValidationResult["filteredOut"] = [];
  const rejected: RejectedListing[] = [];
  const budgetPaise = spec.budget * 100;

  for (const m of models) {
    const accepted: Candidate[] = [];
    for (const c of candidates.filter((x) => x.modelId === m.id)) {
      const v = byId.get(c.id);
      if (v?.match === "exact") accepted.push(c);
      else {
        rejected.push({
          candidateId: c.id,
          modelId: m.id,
          title: c.title,
          store: c.store,
          match: v?.match ?? "unchecked",
          reason: v ? v.reason : "Not checked by the validator",
        });
      }
    }
    const { kept, outliers, tooHigh } = dropPriceOutliers(accepted);
    for (const c of outliers) {
      const reason = tooHigh.has(c) ? HIGH_OUTLIER_REASON : OUTLIER_REASON;
      rejected.push({ candidateId: c.id, modelId: m.id, title: c.title, store: c.store, match: "price_outlier", reason });
    }
    const offers = pickOffers(kept);
    if (!offers.length) {
      filteredOut.push({ modelId: m.id, name: m.name, reason: NO_MATCH_REASON });
      continue;
    }
    const cheapest = offers[0];
    const over = cheapest.pricePaise - budgetPaise;
    items.push({
      modelId: m.id,
      name: m.name,
      stretch: m.stretch,
      currentPrice: rupees(cheapest.pricePaise),
      offers: offers.map((o) => ({
        store: o.store,
        title: o.title,
        price: rupees(o.pricePaise),
        link: o.link,
        linkType: o.linkType,
        googleProductId: o.googleProductId,
      })),
      priceSource: "serper_google_shopping",
      observedAt: cheapest.observedAt,
      withinBudget: over <= 0,
      overBudgetBy: over > 0 ? Math.ceil(rupees(over)) : null,
      googleProductId: cheapest.googleProductId,
      imageUrl: cheapest.imageUrl,
    });
  }

  items.sort((a, b) => Number(b.withinBudget) - Number(a.withinBudget) || a.currentPrice - b.currentPrice);
  return { items, filteredOut, rejected };
}
