import type { GroundingSource, TextGenerator } from "../ai/generator.ts";
import type { HistoryStore } from "../historyStore.ts";
import type { PricePoint, PriceSource, Product, RequirementCheck, WatchSpec } from "../types.ts";

/** JSON Schema for the extraction step (standard JSON Schema; passed as responseJsonSchema). */
const PRODUCT_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      name: { type: "string", description: "Exact model name" },
      store: { type: "string" },
      url: { type: "string", description: "Product page URL exactly as it appears in the text" },
      currentPrice: { type: "number", description: "Current selling price in INR" },
      claimedOriginal: { type: "number", description: "Struck-through MRP / 'was' price in INR, only if stated" },
      features: { type: "array", items: { type: "string" } },
      requirementChecks: {
        type: "array",
        description: "One entry per must-have requirement listed in the instructions",
        items: {
          type: "object",
          properties: {
            requirement: { type: "string", description: "The requirement, copied exactly" },
            met: { type: "string", enum: ["yes", "no", "unknown"] },
            evidence: { type: "string", description: "Short quote from the text supporting the answer; empty if unknown" },
          },
          required: ["requirement", "met", "evidence"],
        },
      },
    },
    required: ["name", "store", "url", "currentPrice", "features", "requirementChecks"],
  },
};

export interface GeminiSourceOptions {
  generator: TextGenerator;
  maxProducts?: number;
  /** Cancels in-flight Gemini calls (used for the live-search timeout). */
  signal?: AbortSignal;
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** True if the product's site is one of the sites Google Search grounded the answer on; undefined if no sources. */
export function linkInSources(url: string, sources: GroundingSource[]): boolean | undefined {
  if (!sources.length) return undefined;
  const host = hostOf(url);
  if (!host) return false;
  return sources.some((s) => {
    const site = (s.domain || s.title || hostOf(s.uri)).toLowerCase().replace(/^www\./, "");
    return !!site && (host === site || host.endsWith(`.${site}`) || site.endsWith(`.${host}`));
  });
}

/**
 * Real product discovery with Gemini, in two calls:
 *   1. grounded search (Google Search tool): find matching products and the prices visible in results (free text)
 *   2. structured extraction (JSON schema): typed product records + a yes/no/unknown check per must-have, with evidence
 * Two calls keep this working on every Gemini model; Gemini 3 can also combine search + schema in one call (preview).
 * Retailers don't expose price history, so each run records today's price into the HistoryStore.
 */
export class GeminiSource implements PriceSource {
  name = "gemini-grounded";
  private max: number;
  private opts: GeminiSourceOptions;
  private store: HistoryStore;

  constructor(opts: GeminiSourceOptions, store: HistoryStore) {
    this.opts = opts;
    this.store = store;
    this.max = opts.maxProducts ?? 5; // each extra product costs several more Google Search rounds
  }

  async discover(spec: WatchSpec): Promise<Product[]> {
    const { generator, signal } = this.opts;
    const must = spec.mustHaves.length ? `Must have: ${spec.mustHaves.join(", ")}.` : "";
    const nice = spec.niceToHaves.length ? `Nice to have: ${spec.niceToHaves.join(", ")}.` : "";
    const avoid = spec.excluded.length ? `Avoid products with: ${spec.excluded.join(", ")}.` : "";

    const grounded = await generator.generate({
      googleSearch: true,
      thinkingLevel: "low", // default thinking ran ~2x the search rounds (80s+ vs ~35-45s)
      signal,
      prompt: `Use Google Search to find up to ${this.max} different ${spec.category} models that Indian shoppers can buy right now for at most ₹${spec.budget}. ${must} ${nice} ${avoid}
Include options from Amazon.in, Flipkart and smaller or niche Indian stores, not just the big marketplaces.
For each, report: exact model name, store, the product page URL, the current selling price in INR, the struck-through MRP/"was" price if the page shows one, and key specifications (inputs, connectivity, power, etc.).
Only report prices you actually saw in the search results. If a price or URL is not visible, write "unknown" rather than guessing.
User request: ${spec.query}`,
    });

    const requirements = spec.mustHaves.length
      ? `For EVERY product, fill requirementChecks with exactly one entry for each of these must-have requirements: ${JSON.stringify(spec.mustHaves)}.
Set met to "yes" only if the text states it, "no" if the text contradicts it, and "unknown" otherwise. Quote the supporting text in evidence.`
      : "Leave requirementChecks empty.";

    const extracted = await generator.generate({
      jsonSchema: PRODUCT_SCHEMA,
      thinkingLevel: "low",
      signal,
      prompt: `Extract product records from the text below. Skip any product whose price or URL is "unknown". Prices are INR numbers (no symbols). Leave claimedOriginal out unless an original/MRP price was stated.
${requirements}
Do not add facts that are not in the text.

${grounded.text}`,
    });

    return this.normalize(JSON.parse(extracted.text), grounded.sources, spec.mustHaves);
  }

  /** Validate model output, drop junk, dedupe, attach checks and source matching, record today's price. */
  normalize(raw: any, sources: GroundingSource[] = [], mustHaves: string[] = []): Product[] {
    const seen = new Set<string>();
    const out: Product[] = [];
    const observedAt = new Date().toISOString();
    for (const r of Array.isArray(raw) ? raw : []) {
      const price = Number(r?.currentPrice);
      if (!r?.name || !r?.store || !/^https?:\/\//.test(r?.url ?? "") || !(price > 0)) continue;
      const id = slug(`${r.store}-${r.name}`);
      if (seen.has(id)) continue;
      seen.add(id);
      const mrp = Number(r.claimedOriginal);
      out.push({
        id,
        name: String(r.name),
        store: String(r.store),
        url: r.url,
        currentPrice: price,
        claimedOriginal: mrp > price ? mrp : undefined,
        features: Array.isArray(r.features) ? r.features.map(String) : [],
        observedAt,
        mustHaveChecks: cleanChecks(r.requirementChecks, mustHaves),
        linkInSources: linkInSources(r.url, sources),
      });
      this.store.record(id, price);
    }
    return out;
  }

  async history(product: Product): Promise<PricePoint[]> {
    return this.store.get(product.id);
  }
}

/** Keep only checks for the user's actual must-haves (model output is untrusted), one per requirement. */
function cleanChecks(raw: unknown, mustHaves: string[]): RequirementCheck[] | undefined {
  if (!mustHaves.length || !Array.isArray(raw)) return undefined;
  const out: RequirementCheck[] = [];
  for (const m of mustHaves) {
    const c = raw.find((x: any) => typeof x?.requirement === "string" && x.requirement.trim().toLowerCase() === m.toLowerCase());
    if (!c) continue;
    const met = c.met === "yes" || c.met === "no" ? c.met : "unknown";
    out.push({ requirement: m, met, evidence: String(c.evidence ?? "").slice(0, 160) });
  }
  return out;
}
