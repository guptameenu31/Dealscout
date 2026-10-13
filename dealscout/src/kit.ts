import { scout } from "./scout.ts";
import { parseBudget } from "./spec.ts";
import type { PriceSource, Product, ScoredProduct, WatchSpec } from "./types.ts";
import type { TraceEvent } from "./scout.ts";

export interface KitItem {
  role: string;
  category: string;
  /** Fraction of the total budget, 0..1. */
  share: number;
  budget: number;
  mustHaves: string[];
  niceToHaves: string[];
}

export interface KitPlan {
  goal: string;
  totalBudget: number;
  items: KitItem[];
}

export interface KitItemResult {
  item: KitItem;
  options: ScoredProduct[];
  pick?: ScoredProduct;
}

export interface KitUpgrade {
  role: string;
  from: Product;
  to: ScoredProduct;
  extra: number;
}

export interface KitResult {
  plan: KitPlan;
  items: KitItemResult[];
  total: number;
  leftover: number;
  upgrade?: KitUpgrade;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const round100 = (n: number) => Math.round(n / 100) * 100;

type Template = Omit<KitItem, "budget">[];
const TEMPLATES: { match: RegExp; goal: string; items: Template }[] = [
  {
    match: /podcast/i,
    goal: "podcast setup",
    items: [
      { role: "Microphone", category: "microphone", share: 0.34, mustHaves: ["XLR"], niceToHaves: ["cardioid"] },
      { role: "Audio interface", category: "audio interface", share: 0.32, mustHaves: ["48V phantom power"], niceToHaves: [] },
      { role: "Headphones", category: "headphones", share: 0.22, mustHaves: ["closed-back"], niceToHaves: ["wired"] },
      { role: "Boom arm", category: "boom arm", share: 0.12, mustHaves: ["desk clamp"], niceToHaves: [] },
    ],
  },
];

export function withBudgets(goal: string, totalBudget: number, items: Template): KitPlan {
  const sum = items.reduce((a, i) => a + i.share, 0) || 1;
  return {
    goal,
    totalBudget,
    items: items.map((i) => ({ ...i, share: i.share / sum, budget: round100((i.share / sum) * totalBudget) })),
  };
}

/** Offline fallback: known kit templates keyed by words in the request. */
export function heuristicKitPlan(request: string): KitPlan | undefined {
  const t = TEMPLATES.find((t) => t.match.test(request));
  if (!t) return undefined;
  return withBudgets(t.goal, parseBudget(request) ?? 30000, t.items);
}

const PLAN_SCHEMA = {
  type: "OBJECT",
  properties: {
    goal: { type: "STRING" },
    totalBudget: { type: "NUMBER", description: "Total budget in INR" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          role: { type: "STRING", description: "Human name, e.g. Microphone" },
          category: { type: "STRING", description: "Short lowercase product category for search" },
          share: { type: "NUMBER", description: "Fraction of the total budget for this item" },
          mustHaves: { type: "ARRAY", items: { type: "STRING" } },
          niceToHaves: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["role", "category", "share", "mustHaves", "niceToHaves"],
      },
    },
  },
  required: ["goal", "totalBudget", "items"],
};

/** Gemini turns "I'm starting X, ₹N total" into a shopping list with a budget split. */
export async function buildKitPlan(request: string): Promise<{ plan: KitPlan; via: "gemini" | "heuristic" } | undefined> {
  const key = process.env.GEMINI_API_KEY;
  if (key) {
    try {
      const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `A shopper in India describes a goal and a total budget in INR. List the 2 to 6 products they need to buy, split the budget between them (shares sum to 1; spend more on what matters most for the goal), and give hard requirements per item. Make requirements compatible across items (e.g. an XLR microphone needs an interface with phantom power if it is a condenser). Keep requirement phrases short, e.g. "XLR", "48V phantom power", "2 inputs".\n\nRequest: ${request}`,
                },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json", responseSchema: PLAN_SCHEMA },
        }),
      });
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
      const data: any = await res.json();
      const p = JSON.parse(data.candidates[0].content.parts[0].text);
      if (!Array.isArray(p.items) || !p.items.length) throw new Error("empty plan");
      return { plan: withBudgets(p.goal, parseBudget(request) ?? p.totalBudget, p.items), via: "gemini" };
    } catch (err) {
      console.warn(`Gemini kit plan failed (${(err as Error).message}); using templates.`);
    }
  }
  const plan = heuristicKitPlan(request);
  return plan && { plan, via: "heuristic" };
}

export const itemSpec = (plan: KitPlan, item: KitItem, budget = item.budget): WatchSpec => ({
  query: `${item.role} for ${plan.goal}`,
  category: item.category,
  budget,
  mustHaves: item.mustHaves,
  niceToHaves: item.niceToHaves,
  searchTerms: [item.category, `best ${item.category} India`],
});

/** Best non-skipped option: prefer one that fits the need without paying for extras. */
export function choosePick(options: ScoredProduct[]): ScoredProduct | undefined {
  const ok = options.filter((o) => o.verdict.label !== "skip");
  return ok.find((o) => o.verdict.label === "buy_now" && !o.fit.overkill) ?? ok.find((o) => !o.fit.overkill) ?? ok[0];
}

/**
 * Scout every item in the kit within its share of the budget, pick one product per item, then
 * see whether money left over from cheaper picks could buy a real upgrade somewhere.
 */
export async function scoutKit(
  plan: KitPlan,
  source: PriceSource,
  onEvent: (e: TraceEvent) => void = () => {},
): Promise<KitResult> {
  onEvent({
    kind: "info",
    text: `Split ${inr(plan.totalBudget)} across ${plan.items.length} items: ${plan.items.map((i) => `${i.role} ${inr(i.budget)}`).join(", ")}`,
  });

  const results: KitItemResult[] = [];
  for (const item of plan.items) {
    onEvent({ kind: "info", text: `${item.role}: scouting within ${inr(item.budget)}…` });
    // Forward only the notable per-product events, so a four-item kit doesn't bury the trace.
    const options = await scout(itemSpec(plan, item), source, (e) => {
      if (e.kind === "warn" || e.kind === "skip") onEvent({ kind: e.kind, text: `[${item.role}] ${e.text}` });
    });
    const pick = choosePick(options);
    results.push({ item, options, pick });
    onEvent(
      pick
        ? { kind: pick.verdict.label === "buy_now" ? "good" : "info", text: `${item.role}: picked ${pick.product.name} at ${inr(pick.product.currentPrice)} (${pick.verdict.label === "buy_now" ? "buy now" : "wait"})` }
        : { kind: "warn", text: `${item.role}: nothing suitable under ${inr(item.budget)}` },
    );
  }

  const total = results.reduce((a, r) => a + (r.pick?.product.currentPrice ?? 0), 0);
  const leftover = plan.totalBudget - total;
  let upgrade: KitUpgrade | undefined;

  if (leftover > 0) {
    onEvent({ kind: "info", text: `${inr(leftover)} left over. Looking for an upgrade worth buying…` });
    for (const r of results) {
      if (!r.pick) continue;
      // Options skipped for being over budget are exactly what a stretched budget can reconsider.
      const seen = new Set(r.options.filter((o) => o.verdict.label !== "skip").map((o) => o.product.id));
      const stretched = await scout(itemSpec(plan, r.item, r.item.budget + leftover), source);
      for (const c of stretched) {
        const extra = c.product.currentPrice - r.pick.product.currentPrice;
        const worth = !seen.has(c.product.id) && c.verdict.label === "buy_now" && !c.fit.overkill && extra > 0 && extra <= leftover;
        if (worth && (!upgrade || c.verdict.realDiscountPct > upgrade.to.verdict.realDiscountPct)) {
          upgrade = { role: r.item.role, from: r.pick.product, to: c, extra };
        }
      }
    }
    if (upgrade) onEvent({ kind: "good", text: `Upgrade found: ${upgrade.role} → ${upgrade.to.product.name} for ${inr(upgrade.extra)} more` });
  }

  onEvent({ kind: "good", text: `Kit total ${inr(total)} of ${inr(plan.totalBudget)}.` });
  return { plan, items: results, total, leftover, upgrade };
}
