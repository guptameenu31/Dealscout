export interface WatchSpec {
  query: string;
  category: string;
  budget: number; // INR
  currency: "INR";
  mustHaves: string[];
  niceToHaves: string[];
  /** Features the user explicitly does not want. */
  excluded: string[];
  searchTerms: string[];
  needsClarification: boolean;
  clarificationQuestion: string | null;
}

/** live = really observed; seeded = synthetic demo data (must always be disclosed). */
export type PointProvenance = "live" | "seeded";

export interface PricePoint {
  date: string; // YYYY-MM-DD
  price: number;
  /** Missing on legacy records; treat as "live". */
  provenance?: PointProvenance;
}

export interface Product {
  id: string;
  name: string;
  store: string;
  url: string;
  currentPrice: number;
  /** The "was" / MRP price the store advertises, if any. */
  claimedOriginal?: number;
  features: string[];
  /** When currentPrice was observed (ISO). */
  observedAt?: string;
  /** Live discovery only: Gemini's per-requirement check, with evidence quoted from the search results. */
  mustHaveChecks?: RequirementCheck[];
  /** Live discovery only: does the product URL's site appear among Google Search's grounding sources? */
  linkInSources?: boolean;
}

export interface RequirementCheck {
  requirement: string;
  met: "yes" | "no" | "unknown";
  /** Short quote or paraphrase from the search results supporting the answer. */
  evidence: string;
}

export type VerdictLabel = "buy_now" | "wait" | "skip";

export interface Verdict {
  label: VerdictLabel;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  fakeDiscount: boolean;
  /** Discount vs. the product's real typical price, in percent. */
  realDiscountPct: number;
  /** Discount the store claims, in percent. */
  claimedDiscountPct: number;
  isLowestSeen: boolean;
}

export interface ScoredProduct {
  product: Product;
  history: PricePoint[];
  verdict: Verdict;
}

/** Single plug-in point for retailers: grounded search, official APIs, or fake data. */
export interface PriceSource {
  name: string;
  /** Find products matching the watch spec, with their current price. */
  discover(spec: WatchSpec): Promise<Product[]>;
  /** Price history for a product, oldest first. Empty if unknown. */
  history(product: Product): Promise<PricePoint[]>;
}
