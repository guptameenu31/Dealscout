import { median } from "./verdict.ts";
import type { PricePoint } from "./types.ts";

export interface PriceStats {
  count: number;
  lowest: number;
  median: number;
  highest: number;
  firstDate: string; // YYYY-MM-DD
  lastDate: string;
  /** Calendar days covered, inclusive. */
  days: number;
  /** How many points are synthetic demo data. */
  seededCount: number;
}

const DAY_MS = 86_400_000;

/** Descriptive statistics over a price history (oldest first). Null when there is no history. */
export function computeStats(history: PricePoint[]): PriceStats | null {
  if (!history.length) return null;
  const prices = history.map((h) => h.price);
  const dates = history.map((h) => h.date).sort();
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  return {
    count: history.length,
    lowest: Math.min(...prices),
    median: Math.round(median(prices)),
    highest: Math.max(...prices),
    firstDate,
    lastDate,
    days: Math.round((Date.parse(lastDate) - Date.parse(firstDate)) / DAY_MS) + 1,
    seededCount: history.filter((h) => h.provenance === "seeded").length,
  };
}
