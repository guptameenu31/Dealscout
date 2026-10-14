import { ApiClientError } from "./errors";
import type { PricePoint, PriceStats, ScoredItem, ScoutMode, ScoutResponse, Verdict, Watch, WatchSpec } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAYS = 60;

// ---- deterministic noise so the demo looks the same on every reload ----
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isoDay = (daysAgo: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

function history(id: string, base: number, days = DAYS, early?: { days: number; price: number }): PricePoint[] {
  const r = rng(id);
  return Array.from({ length: days }, (_, i) => {
    const noisy = base * (1 + (r() - 0.5) * 0.06);
    const price = early && i < early.days ? early.price : noisy;
    return { date: isoDay(days - i), price: Math.round(price / 100) * 100 - 1, provenance: "seeded" as const };
  });
}

function statsOf(h: PricePoint[]): PriceStats | null {
  if (!h.length) return null;
  const prices = h.map((p) => p.price).sort((a, b) => a - b);
  const m = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[m] : (prices[m - 1] + prices[m]) / 2;
  return {
    count: h.length,
    lowest: prices[0],
    median: Math.round(median),
    highest: prices[prices.length - 1],
    firstDate: h[0].date,
    lastDate: h[h.length - 1].date,
    days: Math.round((Date.parse(h[h.length - 1].date) - Date.parse(h[0].date)) / 86400000) + 1,
    seededCount: h.filter((p) => p.provenance === "seeded").length,
  };
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

interface Fixture {
  id: string;
  name: string;
  store: string;
  price: number;
  claimed: number | null;
  features: string[];
  hist: PricePoint[];
  verdict: Omit<Verdict, "label"> & { label: Verdict["label"] };
}

const fixtures: Fixture[] = [
  {
    id: "umc204hd", name: "Behringer UMC204HD", store: "Amazon.in", price: 9499, claimed: 12999,
    features: ["2 inputs", "4 outputs", "USB", "48V phantom power", "24-bit/192kHz"],
    hist: history("umc204hd", 11000, DAYS, { days: 10, price: 12999 }),
    verdict: { label: "buy_now", confidence: "high", fakeDiscount: false, realDiscountPct: 13.6, claimedDiscountPct: 26.9, isLowestSeen: true,
      reasons: ["Lowest price in 60 days (previous low ₹10,699).", "The store's ₹12,999 price was real: it held for the first 10 days."] },
  },
  {
    id: "scarlett-2i2", name: "Focusrite Scarlett 2i2 (3rd Gen)", store: "Amazon.in", price: 11999, claimed: 17999,
    features: ["2 inputs", "USB-C", "48V phantom power", "24-bit/192kHz"],
    hist: history("scarlett-2i2", 13500),
    verdict: { label: "buy_now", confidence: "high", fakeDiscount: true, realDiscountPct: 11.8, claimedDiscountPct: 33.3, isLowestSeen: true,
      reasons: ["Store claims 33.3% off ₹17,999, but it has never sold above ₹13,899 in 60 days. Real discount: 11.8%.", "Lowest price in 60 days (previous low ₹13,099)."] },
  },
  {
    id: "audiobox-usb96", name: "PreSonus AudioBox USB 96", store: "Flipkart", price: 8499, claimed: 12999,
    features: ["2 inputs", "USB", "48V phantom power", "24-bit/96kHz"],
    hist: history("audiobox-usb96", 8500),
    verdict: { label: "wait", confidence: "high", fakeDiscount: true, realDiscountPct: 0, claimedDiscountPct: 34.6, isLowestSeen: false,
      reasons: ["Store claims 34.6% off ₹12,999, but it has never sold above ₹8,699 in 60 days. Real discount: 0%.", "At or above its usual price; it has dropped to ₹8,199 before."] },
  },
  {
    id: "mtrack-duo", name: "M-Audio M-Track Duo", store: "Musicians Hub", price: 9199, claimed: 10999,
    features: ["2 inputs", "USB", "48V phantom power", "24-bit/48kHz"],
    hist: history("mtrack-duo", 8800),
    verdict: { label: "wait", confidence: "medium", fakeDiscount: true, realDiscountPct: 0, claimedDiscountPct: 16.4, isLowestSeen: false,
      reasons: ["Price has been falling over the last week; ₹9,199 is still above the ₹8,199 low."] },
  },
  {
    id: "tascam-us2x2hr", name: "Tascam US-2x2HR", store: "Sweetwater India", price: 13499, claimed: null,
    features: ["2 inputs", "USB", "48V phantom power", "24-bit/192kHz"],
    hist: history("tascam-us2x2hr", 13800, 6),
    verdict: { label: "wait", confidence: "low", fakeDiscount: false, realDiscountPct: 0, claimedDiscountPct: 0, isLowestSeen: false,
      reasons: ["Only 6 days of price history, not enough to tell if this is a good price. We'll keep tracking."] },
  },
  {
    id: "audient-id4", name: "Audient iD4 MKII", store: "Amazon.in", price: 20999, claimed: 24999,
    features: ["2 inputs", "USB-C", "48V phantom power", "24-bit/96kHz"],
    hist: history("audient-id4", 22000),
    verdict: { label: "skip", confidence: "high", fakeDiscount: false, realDiscountPct: 4.5, claimedDiscountPct: 16, isLowestSeen: false,
      reasons: ["₹20,999 is over your ₹15,000 budget."] },
  },
];

function buildItems(budget: number): ScoredItem[] {
  const rank = { buy_now: 0, wait: 1, skip: 2 } as const;
  const items = fixtures.map<ScoredItem>((f) => {
    const over = f.price > budget;
    const verdict: Verdict = over
      ? { ...f.verdict, label: "skip", confidence: "high", reasons: [`${inr(f.price)} is over your ${inr(budget)} budget.`] }
      : f.verdict;
    return {
      product: {
        id: f.id, name: f.name, store: f.store, url: `https://example.com/${f.id}`,
        currentPrice: f.price, claimedOriginal: f.claimed, features: f.features, observedAt: new Date().toISOString(),
      },
      history: f.hist,
      stats: statsOf(f.hist),
      verdict,
      dataNotes: [`Price history is synthetic demo data (${f.hist.length} points).`],
    };
  });
  return items.sort((a, b) => rank[a.verdict.label] - rank[b.verdict.label]);
}

export async function health() {
  await sleep(150);
  return { ok: true, version: "mock" };
}

function parseBudget(text: string): number {
  const cue = text.match(/(?:under|below|within|upto|up to|budget(?: of)?|₹|rs\.?)\s*(?:₹|rs\.?)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|l|lakh)?\b/i);
  if (!cue) return 15000;
  const n = parseFloat(cue[1].replace(/,/g, ""));
  const u = (cue[2] ?? "").toLowerCase();
  return Math.round(u === "k" ? n * 1000 : u === "l" || u === "lakh" ? n * 100000 : n);
}

export async function getSpec(request: string) {
  await sleep(800);
  const lower = request.toLowerCase();
  const vague = lower.includes("something");
  const must: string[] = [];
  if (/phantom|48v/.test(lower)) must.push("48V phantom power");
  const inputs = lower.match(/(\d)[\s-]*inputs?/);
  if (inputs) must.push(`${inputs[1]} inputs`);
  if (/usb[- ]?c/.test(lower)) must.push("USB-C");
  const category = /audio interface|interface/.test(lower)
    ? "audio interface"
    : request.split(/\b(?:with|for|under|below|within)\b|₹/i)[0].trim().replace(/,$/, "") || "product";
  const spec: WatchSpec = {
    query: request, category, budget: parseBudget(request), currency: "INR",
    mustHaves: must, niceToHaves: [], excluded: [], searchTerms: [category],
    needsClarification: vague,
    clarificationQuestion: vague ? "What will you mainly use it for?" : null,
  };
  return { spec, via: "heuristic" as const, warnings: ["Mock API: Gemini is not running, so this is basic parsing."] };
}

export async function scout(spec: WatchSpec, mode: ScoutMode): Promise<ScoutResponse> {
  await sleep(2500);
  const failVariant = spec.query.toLowerCase().includes("fail") && mode === "auto";
  if (mode === "live") throw new ApiClientError("UPSTREAM_ERROR", "Live search is not available in the mock API.", 502);
  const items = buildItems(spec.budget);
  const now = new Date();
  return {
    runId: crypto.randomUUID(),
    generatedAt: now.toISOString(),
    provenance: failVariant ? "cached" : "seeded",
    fallbackReason: failVariant ? "Live search timed out after 25s" : null,
    cachedAt: failVariant ? new Date(now.getTime() - 86_400_000).toISOString() : null,
    spec,
    items,
    filteredOut: [{ name: "Generic USB Sound Card", store: "Flipkart", reason: "Missing: 48V phantom power" }],
  };
}

export async function previewDigest(spec: WatchSpec, _mode: ScoutMode) {
  await sleep(600);
  const r = await scout(spec, "seeded").catch(() => null);
  const rows = (r?.items ?? [])
    .filter((i) => i.verdict.label !== "skip")
    .map((i) => `<li style="margin:6px 0"><b>${i.product.name}</b> (${i.product.store}) ${inr(i.product.currentPrice)}: ${i.verdict.label === "buy_now" ? "Buy now" : "Wait"}${i.verdict.fakeDiscount ? " (inflated discount)" : ""}</li>`)
    .join("");
  return {
    subject: `DealScout: your ${spec.category} digest`,
    html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:520px;margin:24px auto;color:#0f172a"><h2>DealScout digest</h2><p style="color:#64748b">${spec.category} under ${inr(spec.budget)}</p><ul style="padding-left:18px">${rows}</ul><p style="color:#94a3b8;font-size:12px">Demo data from the mock API.</p></body></html>`,
  };
}

export async function sendDigest(_spec: WatchSpec, email: string) {
  await sleep(700);
  return { sent: true as const, to: email };
}

// ---- watches (in memory) ----
const watches: Watch[] = [];

export async function createWatch(spec: WatchSpec, email: string): Promise<Watch> {
  await sleep(500);
  const w: Watch = { id: crypto.randomUUID(), spec, email, createdAt: new Date().toISOString(), lastCheckedAt: null, lastResult: null };
  watches.push(w);
  return w;
}

export async function listWatches() {
  await sleep(300);
  return { watches: [...watches] };
}

export async function getWatch(id: string): Promise<Watch> {
  await sleep(200);
  const w = watches.find((x) => x.id === id);
  if (!w) throw new ApiClientError("NOT_FOUND", "That watch no longer exists.", 404);
  return w;
}

export async function checkWatch(id: string): Promise<Watch> {
  const w = await getWatch(id);
  w.lastResult = await scout(w.spec, "auto");
  w.lastCheckedAt = new Date().toISOString();
  return w;
}

export async function deleteWatch(id: string) {
  await sleep(300);
  const i = watches.findIndex((x) => x.id === id);
  if (i >= 0) watches.splice(i, 1);
  return { deleted: true as const };
}
