import type { PricePoint, Product, Verdict, WatchSpec } from "./types.ts";

const MIN_HISTORY_DAYS = 14;
/** A claimed "was" price counts as real only if history got within this fraction of it. */
const CLAIM_TOLERANCE = 0.05;
const NEAR_LOW = 1.02;

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))));
  return s[idx];
}

const pct = (a: number, b: number) => (b > 0 ? Math.round(((b - a) / b) * 1000) / 10 : 0);
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/**
 * Judge whether a product's current price is a real deal, using its own price history.
 * `history` is oldest-first and should not include today's price.
 */
export function judge(product: Product, history: PricePoint[], spec: WatchSpec): Verdict {
  const cur = product.currentPrice;
  const claimed = product.claimedOriginal;
  const claimedDiscountPct = claimed ? pct(cur, claimed) : 0;

  if (cur > spec.budget) {
    return {
      label: "skip",
      confidence: "high",
      reasons: [`${inr(cur)} is over your ${inr(spec.budget)} budget.`],
      fakeDiscount: false,
      realDiscountPct: 0,
      claimedDiscountPct,
      isLowestSeen: false,
    };
  }

  const prices = history.map((h) => h.price);
  if (prices.length < MIN_HISTORY_DAYS) {
    return {
      label: "wait",
      confidence: "low",
      reasons: [
        `Only ${prices.length} days of price history, not enough to tell if this is a good price. We'll keep tracking.`,
      ],
      fakeDiscount: false,
      realDiscountPct: 0,
      claimedDiscountPct,
      isLowestSeen: false,
    };
  }

  const typical = median(prices);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const p25 = percentile(prices, 25);
  const realDiscountPct = pct(cur, typical);
  const isLowestSeen = cur < min;
  const nearLow = cur <= min * NEAR_LOW;

  // The "was" price is fake if the product never actually sold anywhere near it.
  const fakeDiscount = !!claimed && claimedDiscountPct >= 10 && max < claimed * (1 - CLAIM_TOLERANCE);

  const recent = prices.slice(-7);
  const earlier = prices.slice(-21, -7);
  const trendingDown =
    earlier.length >= 5 && recent.reduce((a, b) => a + b, 0) / recent.length < (earlier.reduce((a, b) => a + b, 0) / earlier.length) * 0.97;

  const reasons: string[] = [];
  if (fakeDiscount) {
    reasons.push(
      `Store claims ${claimedDiscountPct}% off ${inr(claimed!)}, but it has never sold above ${inr(max)} in ${prices.length} days. Real discount: ${Math.max(realDiscountPct, 0)}%.`,
    );
  }

  let label: Verdict["label"];
  let confidence: Verdict["confidence"] = prices.length >= 45 ? "high" : "medium";

  if (isLowestSeen) {
    label = "buy_now";
    reasons.push(`Lowest price in ${prices.length} days (previous low ${inr(min)}).`);
  } else if ((nearLow && realDiscountPct >= 3) || (cur <= p25 && realDiscountPct >= 8)) {
    label = "buy_now";
    reasons.push(`${inr(cur)} is ${realDiscountPct}% below its usual ${inr(typical)} and within 2% of the ${prices.length}-day low.`);
  } else if (trendingDown) {
    label = "wait";
    reasons.push(`Price has been falling over the last week; ${inr(cur)} is still above the ${inr(min)} low.`);
  } else {
    label = "wait";
    reasons.push(
      realDiscountPct > 0
        ? `Only ${realDiscountPct}% below its usual ${inr(typical)}; it has dropped to ${inr(min)} before.`
        : `At or above its usual price of ${inr(typical)}; it has dropped to ${inr(min)} before.`,
    );
    confidence = "medium";
  }

  return { label, confidence, reasons, fakeDiscount, realDiscountPct, claimedDiscountPct, isLowestSeen };
}
