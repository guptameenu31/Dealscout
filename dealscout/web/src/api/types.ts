export type Provenance = "live" | "cached" | "seeded";
export type ScoutMode = "auto" | "live" | "seeded";
export type VerdictLabel = "buy_now" | "wait" | "skip";
export type Confidence = "high" | "medium" | "low";

export interface WatchSpec {
  query: string; // the user's original sentence
  category: string; // e.g. "audio interface"
  budget: number; // max price in INR, whole rupees
  currency: "INR";
  mustHaves: string[]; // hard requirements
  niceToHaves: string[];
  excluded: string[]; // features the user does NOT want
  searchTerms: string[]; // used by the backend; show read-only or hide
  needsClarification: boolean;
  clarificationQuestion: string | null;
}

export interface Product {
  id: string;
  name: string; // "Focusrite Scarlett 2i2 (3rd Gen)"
  store: string; // "Amazon.in"
  url: string; // link to the store page (open in new tab)
  currentPrice: number; // INR
  claimedOriginal: number | null; // store's struck-through "was"/MRP price, if shown
  features: string[]; // ["2 inputs", "USB-C", "48V phantom power"]
  observedAt: string; // when currentPrice was seen (ISO)
}

export interface PricePoint {
  date: string; // "YYYY-MM-DD"
  price: number; // INR
  provenance: "live" | "seeded"; // seeded = synthetic demo data, must be visually distinct
}

export interface PriceStats {
  count: number; // number of observations
  lowest: number;
  median: number;
  highest: number;
  firstDate: string; // "YYYY-MM-DD"
  lastDate: string;
  days: number; // calendar days covered
  seededCount: number; // how many of the points are synthetic
}

export interface Verdict {
  label: VerdictLabel; // buy_now | wait | skip (skip = over budget)
  confidence: Confidence;
  reasons: string[]; // human-readable, show as bullet list
  fakeDiscount: boolean; // true = store's "was" price looks inflated
  realDiscountPct: number; // vs. typical (median) price, e.g. 11.8
  claimedDiscountPct: number; // what the store claims, e.g. 33.3 (0 if no claim)
  isLowestSeen: boolean; // current price is below every recorded price
}

export interface ScoredItem {
  product: Product;
  history: PricePoint[]; // oldest first; may be empty
  stats: PriceStats | null; // null when history is empty
  verdict: Verdict;
  dataNotes: string[]; // limitations, e.g. "History includes 45 synthetic points"
}

export interface ScoutResponse {
  runId: string;
  generatedAt: string; // ISO
  provenance: Provenance; // where the PRODUCT LIST came from
  fallbackReason: string | null; // why we fell back (e.g. "Live search timed out"), else null
  cachedAt: string | null; // when the cached result was originally fetched (provenance=cached)
  spec: WatchSpec;
  items: ScoredItem[]; // already sorted: buy_now first, then wait, then skip
  filteredOut: { name: string; store: string; reason: string }[]; // found but didn't meet must-haves
}

export interface Watch {
  id: string;
  spec: WatchSpec;
  email: string;
  createdAt: string;
  lastCheckedAt: string | null;
  lastResult: ScoutResponse | null;
}

export interface ApiError {
  error: { code: ErrorCode; message: string; details?: unknown };
}
export type ErrorCode =
  | "VALIDATION_ERROR" // 400 — show message next to the form
  | "NOT_FOUND" // 404
  | "RATE_LIMITED" // 429 — "Too many requests, try again in a minute"
  | "UPSTREAM_ERROR" // 502 — AI/search provider failed
  | "NOT_IMPLEMENTED" // 501 — feature not ready: hide or disable that UI, never crash
  | "INTERNAL"; // 500
