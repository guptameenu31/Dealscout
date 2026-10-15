/**
 * API contract. Mirrors the backend: dealscout/src/server/routes/pipeline.ts (search) and routes/spec.ts.
 * Search is a short pipeline: research → (details per model ∥ offers → validate).
 */

export interface WatchSpec {
  query: string; // the user's original sentence
  category: string; // e.g. "truly wireless earbuds"
  budget: number; // max price in INR, whole rupees
  currency: "INR";
  mustHaves: string[]; // hard requirements
  niceToHaves: string[]; // used by research to rank and to pick which figures to report
  excluded: string[]; // features the user does NOT want
  searchTerms: string[]; // used by the backend; show read-only or hide
  needsClarification: boolean;
  clarificationQuestion: string | null;
}

// ---------- POST /api/research ----------

export interface ShortlistModel {
  id: string; // slug; ties details, listings and prices to this model
  name: string; // as sold in India, e.g. "Sony WF-C700N"
  stretch: boolean; // expected to cost up to 30% over budget
  why: string; // one line
}

export interface ResearchResponse {
  models: ShortlistModel[]; // ≤5 within budget + ≤2 stretch
  researchedAt: string; // ISO
  cached: boolean;
}

// ---------- POST /api/research/details ----------

export interface MustHaveCheck {
  req: string;
  result: "yes" | "no" | "unknown";
  evidence: string;
}

export interface ModelDetails {
  modelId: string;
  whyFits: string;
  keySpecs: string[];
  mustHaveChecks: MustHaveCheck[];
  community: string; // what reviewers / Reddit / forums say
  concerns: string[];
}

export interface DetailsResponse {
  details: (ModelDetails | { modelId: string; error: string })[];
  filteredOut: { modelId: string; name: string; reason: string }[]; // a must-have is not met
}

// ---------- POST /api/offers ----------

/** A Serper Google Shopping listing that may or may not be the model; /api/validate decides. Pass back unchanged. */
export interface Candidate {
  id: string;
  modelId: string;
  title: string;
  store: string;
  pricePaise: number;
  link: string;
  linkType: "shopping" | "search";
  googleProductId: string | null;
  imageUrl: string | null;
  observedAt: string;
}

export interface OffersResponse {
  observedAt: string;
  results: { modelId: string; name: string; candidates: Candidate[]; error: string | null }[];
}

// ---------- POST /api/validate ----------

export interface ApiOffer {
  store: string;
  title: string;
  price: number; // rupees (may have paise as decimals)
  link: string;
  linkType: "shopping" | "search"; // "search" = a Google Shopping search link, not a product page
  googleProductId: string | null;
}

export interface ValidatedItem {
  modelId: string;
  name: string;
  stretch: boolean;
  currentPrice: number; // cheapest accepted offer, rupees
  offers: ApiOffer[]; // cheapest first, one per store, ≤4
  priceSource: "serper_google_shopping";
  observedAt: string;
  withinBudget: boolean;
  overBudgetBy: number | null; // rupees, computed by the server
  googleProductId: string | null;
  imageUrl: string | null;
}

export type ListingMatch = "exact" | "accessory" | "bundle" | "different_model" | "used_or_refurbished" | "other";

export interface RejectedListing {
  candidateId: string;
  modelId: string;
  title: string;
  store: string;
  match: ListingMatch | "unchecked" | "price_outlier";
  reason: string;
}

export interface ValidateResponse {
  generatedAt: string;
  spec: WatchSpec;
  items: ValidatedItem[]; // within budget first, then cheapest first
  filteredOut: { modelId: string; name: string; reason: string }[]; // no matching listing found
  rejected: RejectedListing[];
  advice: null; // AI advisor: later
}

// ---------- Watches (v1.2: Firestore + scheduled checks; endpoints answer 501 today) ----------

export interface Watch {
  id: string;
  spec: WatchSpec;
  email: string;
  createdAt: string;
  lastCheckedAt: string | null;
  lastResult: unknown; // shape decided in v1.2
}

// ---------- Errors ----------

export interface ApiError {
  error: { code: ErrorCode; message: string; details?: unknown };
}
export type ErrorCode =
  | "VALIDATION_ERROR" // 400 — show message next to the form
  | "NOT_FOUND" // 404
  | "RATE_LIMITED" // 429 — "Too many requests, try again in a minute"
  | "UPSTREAM_ERROR" // 502 — AI/search provider failed
  | "NOT_IMPLEMENTED" // 501 — feature not ready / not configured: hide or disable that UI, never crash
  | "INTERNAL"; // 500
