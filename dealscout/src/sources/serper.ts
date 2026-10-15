/**
 * Real prices from Serper.dev's Google Shopping endpoint (India). Gemini never supplies prices: it only
 * accepts or rejects the candidates built here (see ai/validator.ts). Code owns every ₹ figure (plan-v1.1 §1).
 */

/** One raw result from Serper /shopping (fields as returned on Oct 15, 2026). */
export interface SerperShoppingItem {
  title: string;
  source?: string;
  link?: string;
  price?: string;
  imageUrl?: string;
  rating?: number;
  ratingCount?: number;
  productId?: string;
  position?: number;
}

/** A Serper listing that may or may not be the researched model; the AI validator decides. */
export interface Candidate {
  /** `${modelId}#${n}`: the only handle the validator uses to refer to a listing. */
  id: string;
  modelId: string;
  title: string;
  store: string;
  /** Integer paise (₹1 = 100). */
  pricePaise: number;
  link: string;
  /** "search" = Serper gave no link; we built a Google Shopping search URL for the title. */
  linkType: "shopping" | "search";
  /** Serper's productId: stable Google catalog ID, used for watch history later. */
  googleProductId: string | null;
  imageUrl: string | null;
  observedAt: string;
}

const MAX_OFFERS = 4;

export interface SerperClientOptions {
  apiKey: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export class SerperClient {
  private apiKey: string;
  private timeoutMs: number;
  private fetch: typeof globalThis.fetch;

  constructor(opts: SerperClientOptions) {
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  /**
   * Google Shopping results for India, in Google's relevance order. Throws on HTTP errors, bad JSON, timeout or abort.
   * Note: Serper ignores num=10 here and returns ~20 results for 2 credits per call.
   */
  async shopping(query: string, signal?: AbortSignal): Promise<SerperShoppingItem[]> {
    const url = new URL("https://google.serper.dev/shopping");
    url.search = new URLSearchParams({ q: query, gl: "in", hl: "en", num: "10" }).toString();
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const res = await this.fetch(url, {
      headers: { "X-API-KEY": this.apiKey },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) throw new Error(`Serper shopping failed: HTTP ${res.status}`);
    let body: { shopping?: unknown };
    try {
      body = (await res.json()) as { shopping?: unknown };
    } catch {
      throw new Error("Serper shopping returned invalid JSON");
    }
    return Array.isArray(body.shopping) ? (body.shopping as SerperShoppingItem[]) : [];
  }
}

/** "₹23,049" → 2304900, "₹34,506.83" → 3450683. Anything not in ₹ → null. */
export function parseInrPaise(price: string | undefined): number | null {
  const m = price?.trim().match(/^₹\s?(\d{1,3}(?:,\d{2,3})*|\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const rupees = Number(m[1].replace(/,/g, ""));
  const paise = Number((m[2] ?? "0").padEnd(2, "0"));
  const total = rupees * 100 + paise;
  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

export const searchLink = (title: string) =>
  `https://www.google.com/search?udm=28&gl=in&q=${encodeURIComponent(title)}`;

/**
 * The first k usable listings (Serper's relevance order) for one model. Usable = has a title, a store and a ₹ price.
 * Whether a listing is really that model (not an accessory, bundle or sibling model) is the validator's call.
 */
export function toCandidates(modelId: string, items: SerperShoppingItem[], k: number, observedAt: string): Candidate[] {
  const out: Candidate[] = [];
  for (const item of items) {
    if (out.length >= k) break;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const store = typeof item.source === "string" ? item.source.trim() : "";
    const pricePaise = parseInrPaise(item.price);
    if (!title || !store || pricePaise === null) continue;
    const link = typeof item.link === "string" && /^https?:\/\//.test(item.link) ? item.link : "";
    out.push({
      id: `${modelId}#${out.length + 1}`,
      modelId,
      title: title.slice(0, 300),
      store: store.slice(0, 100),
      pricePaise,
      link: link || searchLink(title),
      linkType: link ? "shopping" : "search",
      googleProductId: typeof item.productId === "string" && item.productId ? item.productId : null,
      imageUrl: typeof item.imageUrl === "string" && /^https:\/\//.test(item.imageUrl) ? item.imageUrl : null,
      observedAt,
    });
  }
  return out;
}

/** An offer below this share, or (with 3+ offers) above this multiple, of the model's typical accepted price is implausible. */
const LOW_OUTLIER_SHARE = 0.5;
const HIGH_OUTLIER_MULTIPLE = 2;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Split accepted listings of one model into plausible offers and price outliers: ₹2,990 when other stores ask ₹8,499,
 * or ₹1,42,249 when others ask ₹22,999. Typical = the median of all accepted offers, or for exactly two offers the dearer
 * one (a median of two would hide the outlier). With two offers only the cheap side is checked: we can't tell which of
 * two differing prices is wrong when one is high. A lone offer is always kept.
 */
export function dropPriceOutliers(accepted: Candidate[]): { kept: Candidate[]; outliers: Candidate[]; tooHigh: Set<Candidate> } {
  const tooHigh = new Set<Candidate>();
  if (accepted.length < 2) return { kept: accepted, outliers: [], tooHigh };
  const prices = accepted.map((c) => c.pricePaise);
  const typical = accepted.length === 2 ? Math.max(...prices) : median(prices);
  const kept: Candidate[] = [];
  const outliers: Candidate[] = [];
  for (const c of accepted) {
    const high = accepted.length >= 3 && c.pricePaise > typical * HIGH_OUTLIER_MULTIPLE;
    if (high) tooHigh.add(c);
    (high || c.pricePaise < typical * LOW_OUTLIER_SHARE ? outliers : kept).push(c);
  }
  return { kept, outliers, tooHigh };
}

/** Offers to show for one model: cheapest listing per store, cheapest first, at most 4. */
export function pickOffers(accepted: Candidate[]): Candidate[] {
  const cheapestPerStore = new Map<string, Candidate>();
  for (const c of accepted) {
    const key = c.store.toLowerCase();
    const prev = cheapestPerStore.get(key);
    if (!prev || c.pricePaise < prev.pricePaise) cheapestPerStore.set(key, c);
  }
  return [...cheapestPerStore.values()].sort((a, b) => a.pricePaise - b.pricePaise).slice(0, MAX_OFFERS);
}
