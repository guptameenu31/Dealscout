/**
 * Response shapes of the public HTTP API. These mirror docs/FRONTEND_BRIEF.md section 4 exactly;
 * change them only together with the frontend.
 */
import type { PointProvenance, Verdict, WatchSpec } from "../types.ts";
import type { PriceStats } from "../stats.ts";

export type Provenance = "live" | "cached" | "seeded";
export type ScoutMode = "auto" | "live" | "seeded";

export interface ApiProduct {
  id: string;
  name: string;
  store: string;
  url: string;
  currentPrice: number;
  claimedOriginal: number | null;
  features: string[];
  observedAt: string;
}

export interface ApiPricePoint {
  date: string;
  price: number;
  provenance: PointProvenance;
}

export interface ScoredItem {
  product: ApiProduct;
  history: ApiPricePoint[];
  stats: PriceStats | null;
  verdict: Verdict;
  dataNotes: string[];
}

export interface ScoutResponse {
  runId: string;
  generatedAt: string;
  provenance: Provenance;
  fallbackReason: string | null;
  cachedAt: string | null;
  spec: WatchSpec;
  items: ScoredItem[];
  filteredOut: { name: string; store: string; reason: string }[];
}
