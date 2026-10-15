/**
 * Mock API for frontend work without a backend (VITE_USE_MOCK=true). Data and staggered timings are taken from a real
 * earbuds search (Oct 15, 2026); every search returns these earbuds whatever the request says.
 * Type the word "fail" in a request to make the price lookup fail once, so the retry UI can be seen.
 */
import { ApiClientError } from "./errors";
import type {
  ApiOffer, Candidate, DetailsResponse, ListingMatch, ModelDetails, OffersResponse, RejectedListing, ResearchResponse, ValidateResponse,
  ValidatedItem, WatchSpec,
} from "./types";

/** Resolves after ms, or rejects at once when the signal aborts (like a cancelled fetch). */
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

export async function health() {
  await sleep(150);
  return { ok: true, version: "mock" };
}

function parseBudget(text: string): number {
  const cue = text.match(/(?:under|below|within|upto|up to|budget(?: of)?|₹|rs\.?)\s*(?:₹|rs\.?)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|l|lakh)?\b/i);
  if (!cue) return 10000;
  const n = parseFloat(cue[1].replace(/,/g, ""));
  const u = (cue[2] ?? "").toLowerCase();
  return Math.round(u === "k" ? n * 1000 : u === "l" || u === "lakh" ? n * 100000 : n);
}

export async function getSpec(request: string) {
  await sleep(800);
  const lower = request.toLowerCase();
  const vague = lower.includes("something");
  const must: string[] = [];
  if (/\banc\b|noise cancel/.test(lower)) must.push("active noise cancellation");
  if (/wireless|tws/.test(lower)) must.push("true wireless");
  const nice = /battery/.test(lower) ? ["long battery life"] : [];
  const category = request.split(/\b(?:with|for|under|below|within)\b|₹|,/i)[0].trim() || "product";
  const spec: WatchSpec = {
    query: request, category, budget: parseBudget(request), currency: "INR",
    mustHaves: must, niceToHaves: nice, excluded: [], searchTerms: [category],
    needsClarification: vague,
    clarificationQuestion: vague ? "What will you mainly use it for?" : null,
  };
  return { spec, via: "heuristic" as const, warnings: ["Mock API: Gemini is not running, so this is basic parsing."] };
}

// ---------- Search pipeline ----------

interface MockListing {
  title: string;
  store: string;
  price: number;
  match: ListingMatch | "price_outlier";
  reason?: string;
}

interface MockModel {
  id: string;
  name: string;
  stretch: boolean;
  why: string;
  detailsMs: number;
  details: Omit<ModelDetails, "modelId" | "mustHaveChecks">;
  listings: MockListing[];
}

const MODELS: MockModel[] = [
  {
    id: "oneplus-buds-3", name: "OnePlus Buds 3", stretch: false, detailsMs: 4200,
    why: "49 dB adaptive ANC that mutes transit rumble, with up to 44 hours of total battery.",
    details: {
      whyFits: "Smart adaptive ANC effectively cancels the low-frequency rumble of metro travel, and the long battery reserve covers a week of commutes.",
      keySpecs: ["Battery: 6.5 h buds / 28 h with case (ANC on)", "Battery: 10 h / 44 h (ANC off)", "Up to 49 dB adaptive ANC", "Dual drivers (10.4 mm + 6 mm)", "IP55", "Bluetooth 5.3, dual connection"],
      community: "Reddit users and reviewers praise its punchy bass and swipe volume controls; commuters say the ANC handles train rumble well but muffles chatter less.",
      concerns: ["High-frequency noise and speech are not muffled as well as low rumble", "No wireless charging", "LHDC only on compatible Android phones"],
    },
    listings: [
      { title: "OnePlus Buds 3 Truly Wireless Bluetooth Earbuds", store: "Myntra", price: 4487, match: "exact" },
      { title: "OnePlus Buds 3", store: "LowestRate Shopping", price: 4249, match: "exact" },
      { title: "OnePlus Nord Buds 3 TWS Earbuds with Active Noise Cancellation", store: "poorvika.com", price: 2699, match: "different_model", reason: "Nord Buds 3, not OnePlus Buds 3." },
      { title: "OnePlus Buds Pro 3 True Wireless In-Ear Buds", store: "Amazon.in", price: 10999, match: "different_model", reason: "Buds Pro 3, not Buds 3." },
    ],
  },
  {
    id: "samsung-galaxy-buds-fe", name: "Samsung Galaxy Buds FE", stretch: false, detailsMs: 6100,
    why: "Reliable ANC and wingtips that keep a secure fit on moving trains.",
    details: {
      whyFits: "Effective ANC against train noise, and the wingtip design keeps the buds secure on a crowded metro.",
      keySpecs: ["Battery: 6 h buds / 21 h with case (ANC on)", "Battery: 8.5 h / 30 h (ANC off)", "ANC + ambient mode", "Bluetooth 5.2", "IPX2", "Wingtip fit, 3 mics per bud"],
      community: "Praised for ANC against continuous low-frequency rumble and a secure fit; best features need a Samsung phone.",
      concerns: ["Only IPX2 splash resistance", "No wireless charging", "No iOS companion app"],
    },
    listings: [
      { title: "Samsung Galaxy Buds FE", store: "Banjara Electronics", price: 2990, match: "price_outlier", reason: "Far below other stores' prices for this model" },
      { title: "Samsung Galaxy Buds3 FE with AI", store: "Samsung.com", price: 12999, match: "different_model", reason: "Buds3 FE, not Galaxy Buds FE." },
      { title: "Samsung Galaxy Buds FE (Graphite) | Powerful Active Noise Cancellation", store: "amazon.in", price: 8499, match: "exact" },
    ],
  },
  {
    id: "nothing-ear-a", name: "Nothing Ear (a)", stretch: false, detailsMs: 9800,
    why: "45 dB smart ANC and up to 42.5 hours of playback for long daily commutes.",
    details: {
      whyFits: "Strong smart ANC for its price with a long combined battery, a good fit for daily metro rides.",
      keySpecs: ["Battery: 5.5 h buds / 24 h with case (ANC on)", "Up to 45 dB smart ANC", "11 mm driver", "IP54 buds", "Bluetooth 5.3, LDAC"],
      community: "Reviewers like the sound and design for the price; ANC is good but behind pricier rivals.",
      concerns: ["Stem controls are pinch-only", "Case scratches easily"],
    },
    listings: [
      { title: "Nothing Ear TWS Earbuds with Active Noise Cancellation", store: "Flipkart", price: 4999, match: "different_model", reason: "Nothing Ear, not Nothing Ear (a)." },
      { title: "CMF by Nothing Buds 2a TWS ANC Earbuds", store: "Croma", price: 1899, match: "different_model", reason: "CMF Buds 2a, not Nothing Ear (a)." },
    ],
  },
  {
    id: "sony-wf-c700n", name: "Sony WF-C700N", stretch: false, detailsMs: 5200,
    why: "Sony's dependable ANC and a light, ergonomic fit for long commutes.",
    details: {
      whyFits: "Dependable ANC that cuts transit rumble, in a lightweight ergonomic fit for long rides.",
      keySpecs: ["Battery: 7.5 h buds / 15 h with case (ANC on)", "Battery: 10 h buds (ANC off)", "Quick charge: 10 min = 60 min", "Multipoint", "IPX4"],
      community: "Loved for comfort and effective ANC on buses and trains; physical buttons beat touch controls in a crowd.",
      concerns: ["Case holds only one extra full charge (15 h total)", "No LDAC", "Pressing buttons pushes buds into the ear"],
    },
    listings: [
      { title: "Sony WF-C700N Noise Canceling Truly Wireless Earbuds", store: "Myntra", price: 7990, match: "exact" },
      { title: "Sony WF-C700N Wireless Earbuds", store: "LowestRate Shopping", price: 8799, match: "exact" },
      { title: "Sony WF-C700N Truly Wireless ANC Earbuds (Pre-owned)", store: "GameLoot", price: 4499, match: "used_or_refurbished", reason: "Pre-owned item, not new." },
      { title: "Sony WF-C700N Truly Wireless Lightest ANC Earbuds", store: "TechCommerce.in", price: 8271, match: "exact" },
    ],
  },
  {
    id: "realme-buds-air-6-pro", name: "realme Buds Air 6 Pro", stretch: false, detailsMs: 3600,
    why: "50 dB ANC with dual drivers and up to 40 hours of battery.",
    details: {
      whyFits: "Very strong ANC for the price with a big battery reserve for daily commutes.",
      keySpecs: ["Battery: 7 h buds / 30 h with case (ANC on)", "Battery: 10 h / 40 h (ANC off)", "Up to 50 dB ANC", "Dual drivers", "LDAC", "IP55"],
      community: "Reviewers call it a value pick with strong ANC and LDAC; the app has a learning curve.",
      concerns: ["Bulky case", "Call quality is average in wind"],
    },
    listings: [
      { title: "realme Buds Air 6 Pro TWS Earbuds with Active Noise Cancellation", store: "Zepto", price: 4529, match: "exact" },
      { title: "Realme Buds Air Pro Bluetooth Truly Wireless Earbuds", store: "Digihaat", price: 1499, match: "different_model", reason: "First-generation Buds Air Pro." },
      { title: "Realme Buds Air6 Pro TWS Earbuds Bluetooth 5.3 Noise Cancellation", store: "Zoneofdeals", price: 3099, match: "exact" },
    ],
  },
  {
    id: "oneplus-buds-pro-3", name: "OnePlus Buds Pro 3", stretch: true, detailsMs: 7400,
    why: "Class-leading 50 dB adaptive ANC and Dynaudio-tuned drivers.",
    details: {
      whyFits: "Near-flagship adaptive ANC that also cuts voices, for a noticeably quieter commute.",
      keySpecs: ["Battery: 6 h buds / 43 h total", "Up to 50 dB adaptive ANC", "Dual drivers with Dynaudio", "Qi wireless charging", "IP55"],
      community: "Reviewers rate its ANC close to premium earbuds and praise the faux-leather case.",
      concerns: ["Hi-res LHDC needs a compatible phone", "Thicker case than pillbox rivals"],
    },
    listings: [
      { title: "OnePlus Buds Pro 3 TWS Earbuds", store: "Amazon.in", price: 10999, match: "exact" },
      { title: "OnePlus Nord Buds 3 Pro Truly Wireless Bluetooth Earbuds", store: "Reliance Digital", price: 2599, match: "different_model", reason: "Nord Buds 3 Pro instead of Buds Pro 3." },
      { title: "OnePlus Buds 3 Pro", store: "LowestRate Shopping", price: 10299, match: "exact" },
    ],
  },
  {
    id: "nothing-ear", name: "Nothing Ear", stretch: true, detailsMs: 11800,
    why: "Personalised ANC and ceramic drivers that clearly beat cheaper options in noisy places.",
    details: {
      whyFits: "Personalised ANC and excellent sound, worth it if you want a clear step up from budget picks.",
      keySpecs: ["Battery: 5.2 h buds / 24 h with case (ANC on)", "Adaptive personalised ANC", "Ceramic 11 mm driver", "Wireless charging", "IP54"],
      community: "Praised for sound quality and the customisable EQ; ANC is good though not class-leading.",
      concerns: ["Battery life is average", "Case is large"],
    },
    listings: [
      { title: "Nothing Ear TWS Earbuds with Active Noise Cancellation", store: "Myntra", price: 7999, match: "exact" },
      { title: "CMF by Nothing Buds 2a TWS ANC Earbuds", store: "Croma", price: 1899, match: "different_model", reason: "CMF Buds 2a instead of Nothing Ear." },
      { title: "Nothing Headphone with 42dB ANC", store: "Flipkart", price: 17999, match: "different_model", reason: "Headphone, not Nothing Ear." },
    ],
  },
];

const byId = new Map(MODELS.map((m) => [m.id, m]));
let failedOffersOnce = false;

export async function research(_spec: WatchSpec, signal?: AbortSignal): Promise<ResearchResponse> {
  await sleep(2500, signal);
  return {
    models: MODELS.map(({ id, name, stretch, why }) => ({ id, name, stretch, why })),
    researchedAt: new Date().toISOString(),
    cached: false,
  };
}

export async function researchDetails(spec: WatchSpec, model: { id: string; name: string }, signal?: AbortSignal): Promise<DetailsResponse> {
  const m = byId.get(model.id);
  await sleep(m?.detailsMs ?? 3000, signal);
  if (!m) return { details: [{ modelId: model.id, error: "Details failed: unknown model (mock)" }], filteredOut: [] };
  const mustHaveChecks = spec.mustHaves.map((req) => ({ req, result: "yes" as const, evidence: "Listed in the official specifications" }));
  return { details: [{ modelId: m.id, ...m.details, mustHaveChecks }], filteredOut: [] };
}

export async function offers(spec: WatchSpec, models: { id: string; name: string }[], signal?: AbortSignal): Promise<OffersResponse> {
  await sleep(1200, signal);
  if (spec.query.toLowerCase().includes("fail") && !failedOffersOnce) {
    failedOffersOnce = true;
    throw new ApiClientError("UPSTREAM_ERROR", "Price lookup failed: Serper shopping failed: HTTP 503 (mock)", 502);
  }
  const observedAt = new Date().toISOString();
  return {
    observedAt,
    results: models.map((ref) => {
      const m = byId.get(ref.id);
      const candidates: Candidate[] = (m?.listings ?? []).map((l, i) => ({
        id: `${ref.id}#${i + 1}`, modelId: ref.id, title: l.title, store: l.store, pricePaise: l.price * 100,
        link: `https://www.google.com/search?udm=28&gl=in&q=${encodeURIComponent(l.title)}`, linkType: "search",
        googleProductId: null, imageUrl: null, observedAt,
      }));
      return { modelId: ref.id, name: ref.name, candidates, error: null };
    }),
  };
}

export async function validate(
  spec: WatchSpec,
  models: { id: string; name: string; stretch: boolean }[],
  candidates: Candidate[],
  signal?: AbortSignal,
): Promise<ValidateResponse> {
  await sleep(2000, signal);
  const items: ValidatedItem[] = [];
  const rejected: RejectedListing[] = [];
  const filteredOut: ValidateResponse["filteredOut"] = [];
  for (const m of models) {
    const listings = byId.get(m.id)?.listings ?? [];
    const accepted: ApiOffer[] = [];
    for (const c of candidates.filter((x) => x.modelId === m.id)) {
      const l = listings[Number(c.id.split("#")[1]) - 1];
      if (l?.match === "exact") {
        accepted.push({ store: c.store, title: c.title, price: c.pricePaise / 100, link: c.link, linkType: c.linkType, googleProductId: null });
      } else {
        rejected.push({ candidateId: c.id, modelId: m.id, title: c.title, store: c.store, match: l?.match ?? "unchecked", reason: l?.reason ?? "Not checked" });
      }
    }
    const offersSorted = accepted.sort((a, b) => a.price - b.price).slice(0, 4);
    if (!offersSorted.length) {
      filteredOut.push({ modelId: m.id, name: m.name, reason: "No matching Indian Google Shopping listing found" });
      continue;
    }
    const cheapest = offersSorted[0].price;
    const over = cheapest - spec.budget;
    items.push({
      modelId: m.id, name: m.name, stretch: m.stretch, currentPrice: cheapest, offers: offersSorted,
      priceSource: "serper_google_shopping", observedAt: candidates[0]?.observedAt ?? new Date().toISOString(),
      withinBudget: over <= 0, overBudgetBy: over > 0 ? Math.ceil(over) : null, googleProductId: null, imageUrl: null,
    });
  }
  items.sort((a, b) => Number(b.withinBudget) - Number(a.withinBudget) || a.currentPrice - b.currentPrice);
  return { generatedAt: new Date().toISOString(), spec, items, filteredOut, rejected, advice: null };
}

// ---------- Not built yet (v1.2) ----------

export async function notYet(feature: string): Promise<never> {
  await sleep(300);
  throw new ApiClientError("NOT_IMPLEMENTED", `${feature} is not available yet.`, 501);
}
