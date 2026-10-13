export interface WatchSpec {
  query: string;
  category: string;
  budget: number; // INR
  mustHaves: string[];
  niceToHaves: string[];
  searchTerms: string[];
}

export interface PricePoint {
  date: string; // YYYY-MM-DD
  price: number;
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
