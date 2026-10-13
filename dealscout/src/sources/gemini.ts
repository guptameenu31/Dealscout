import type { PricePoint, PriceSource, Product, WatchSpec } from "../types.ts";
import type { HistoryStore } from "../historyStore.ts";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const PRODUCT_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      name: { type: "STRING" },
      store: { type: "STRING" },
      url: { type: "STRING" },
      currentPrice: { type: "NUMBER", description: "Current selling price in INR" },
      claimedOriginal: { type: "NUMBER", description: "Struck-through MRP / 'was' price in INR, if shown" },
      features: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["name", "store", "url", "currentPrice", "features"],
  },
};

type Fetch = typeof fetch;

export interface GeminiSourceOptions {
  apiKey: string;
  model?: string;
  maxProducts?: number;
  fetchImpl?: Fetch;
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Real product discovery. Two calls, because Gemini can't combine Google Search grounding with
 * a JSON response schema in one request:
 *   1. grounded search: find matching products and the prices seen in results (free text)
 *   2. structured extraction: turn that text into typed Product records
 * Retailers don't expose price history, so each run records today's price into the HistoryStore.
 */
export class GeminiSource implements PriceSource {
  name = "gemini-grounded";
  private model: string;
  private max: number;
  private fetchImpl: Fetch;
  private opts: GeminiSourceOptions;
  private store: HistoryStore;

  constructor(opts: GeminiSourceOptions, store: HistoryStore) {
    this.opts = opts;
    this.store = store;
    this.model = opts.model ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    this.max = opts.maxProducts ?? 8;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async generate(body: unknown): Promise<string> {
    const res = await this.fetchImpl(`${ENDPOINT}/${this.model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": this.opts.apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data: any = await res.json();
    const parts: any[] = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? "").join("");
    if (!text) throw new Error("Gemini returned no text");
    return text;
  }

  async discover(spec: WatchSpec): Promise<Product[]> {
    const must = spec.mustHaves.length ? `Must have: ${spec.mustHaves.join(", ")}.` : "";
    const nice = spec.niceToHaves.length ? `Nice to have: ${spec.niceToHaves.join(", ")}.` : "";
    const grounded = await this.generate({
      contents: [
        {
          parts: [
            {
              text: `Use Google Search to find up to ${this.max} different ${spec.category} models that Indian shoppers can buy right now for at most ₹${spec.budget}. ${must} ${nice}
Include options from Amazon.in, Flipkart and smaller or niche Indian stores, not just the big marketplaces.
For each, report: exact model name, store, the product page URL, the current selling price in INR, the struck-through MRP/"was" price if the page shows one, and key features.
Only report prices you actually saw in the search results. If a price or URL is not visible, write "unknown" rather than guessing.
User request: ${spec.query}`,
            },
          ],
        },
      ],
      tools: [{ google_search: {} }],
    });

    const extracted = await this.generate({
      contents: [
        {
          parts: [
            {
              text: `Extract product records from this text. Skip any product whose price or URL is "unknown". Prices are INR numbers (no symbols). Leave claimedOriginal out unless an original/MRP price was stated.\n\n${grounded}`,
            },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json", responseSchema: PRODUCT_SCHEMA },
    });

    return this.normalize(JSON.parse(extracted));
  }

  /** Validate model output, drop junk, dedupe, and record today's price. */
  normalize(raw: any[]): Product[] {
    const seen = new Set<string>();
    const out: Product[] = [];
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
      });
      this.store.record(id, price);
    }
    return out;
  }

  async history(product: Product): Promise<PricePoint[]> {
    return this.store.get(product.id);
  }
}
