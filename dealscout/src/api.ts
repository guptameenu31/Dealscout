import { randomUUID, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join } from "node:path";
import { renderHtml } from "./digest.ts";
import { HistoryStore } from "./historyStore.ts";
import { scoutDetailed } from "./scout.ts";
import type { FilteredOut } from "./scout.ts";
import { GeminiSource } from "./sources/gemini.ts";
import { MockSource } from "./sources/mock.ts";
import { buildWatchSpec } from "./spec.ts";
import type { PricePoint, PriceSource, Product, ScoredProduct, WatchSpec } from "./types.ts";

// ---- Contract types (the frontend's frozen API contract; see FRONTEND_BRIEF.md section 4) ----
export type Provenance = "live" | "cached" | "seeded";
export type ScoutMode = "auto" | "live" | "seeded";
type ErrorCode = "VALIDATION_ERROR" | "NOT_FOUND" | "RATE_LIMITED" | "UPSTREAM_ERROR" | "NOT_IMPLEMENTED" | "INTERNAL";

export interface PriceStats {
  count: number;
  lowest: number;
  median: number;
  highest: number;
  firstDate: string;
  lastDate: string;
  days: number;
  seededCount: number;
}

export interface ScoredItem {
  product: Omit<Product, "claimedOriginal" | "category"> & { claimedOriginal: number | null; observedAt: string };
  history: { date: string; price: number; provenance: "live" | "seeded" }[];
  stats: PriceStats | null;
  verdict: ScoredProduct["verdict"];
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
  filteredOut: FilteredOut[];
}

export interface Watch {
  id: string;
  spec: WatchSpec;
  email: string;
  createdAt: string;
  lastCheckedAt: string | null;
  lastResult: ScoutResponse | null;
}

class ApiError extends Error {
  status: number;
  code: ErrorCode;
  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const bad = (message: string) => new ApiError(400, "VALIDATION_ERROR", message);

const LIVE_TIMEOUT_MS = Number(process.env.LIVE_TIMEOUT_MS ?? 25000);
const dataDir = () => process.env.DEALSCOUT_DATA_DIR ?? join(import.meta.dirname, "..", "data");
const hasKey = () => !!process.env.GEMINI_API_KEY;
const seedLiveHistory = () => process.env.DEALSCOUT_SEED_HISTORY !== "0";

// ---- Small JSON-file stores (stand-ins for Firestore) ----
function readJson<T>(file: string, fallback: T): T {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(file: string, value: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 1));
}
const cacheFile = () => join(dataDir(), "scout-cache.json");
const watchesFile = () => join(dataDir(), "watches.json");
const specKey = (s: WatchSpec) =>
  createHash("sha1").update(JSON.stringify([s.category.toLowerCase(), s.budget, [...s.mustHaves].sort(), [...(s.excluded ?? [])].sort()])).digest("hex");

// ---- Validation ----
function parseSpec(raw: any): WatchSpec {
  if (!raw || typeof raw !== "object") throw bad("spec is required.");
  const strs = (v: unknown, name: string) => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw bad(`${name} must be a list of text.`);
    return (v as string[]).map((x) => x.trim()).filter(Boolean);
  };
  if (typeof raw.category !== "string" || !raw.category.trim()) throw bad("Category is required.");
  const budget = Number(raw.budget);
  if (!Number.isFinite(budget) || budget <= 0) throw bad("Budget must be a positive number of rupees.");
  return {
    query: typeof raw.query === "string" ? raw.query : "",
    category: raw.category.trim(),
    budget: Math.round(budget),
    currency: "INR",
    mustHaves: strs(raw.mustHaves, "mustHaves"),
    niceToHaves: strs(raw.niceToHaves, "niceToHaves"),
    excluded: strs(raw.excluded, "excluded"),
    searchTerms: strs(raw.searchTerms, "searchTerms"),
    needsClarification: false,
    clarificationQuestion: null,
  };
}
function parseMode(v: unknown): ScoutMode {
  if (v === undefined || v === null) return "auto";
  if (v === "auto" || v === "live" || v === "seeded") return v;
  throw bad('mode must be "auto", "live" or "seeded".');
}
function parseEmail(v: unknown): string {
  if (typeof v !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())) throw bad("Enter a valid email address.");
  return v.trim();
}

// ---- Scout pipeline ----
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function toItem(sp: ScoredProduct): ScoredItem {
  const history = sp.history.map((h: PricePoint) => ({ date: h.date, price: h.price, provenance: h.provenance ?? ("live" as const) }));
  let stats: PriceStats | null = null;
  if (history.length) {
    const prices = history.map((h) => h.price);
    const first = history[0].date;
    const last = history[history.length - 1].date;
    stats = {
      count: history.length,
      lowest: Math.min(...prices),
      median: Math.round(median(prices)),
      highest: Math.max(...prices),
      firstDate: first,
      lastDate: last,
      days: Math.round((Date.parse(last) - Date.parse(first)) / 86_400_000) + 1,
      seededCount: history.filter((h) => h.provenance === "seeded").length,
    };
  }
  const notes: string[] = [];
  if (!stats) notes.push("No price history yet. We will keep tracking.");
  else if (stats.seededCount === stats.count) notes.push(`Price history is synthetic demo data (${stats.count} points).`);
  else if (stats.seededCount > 0) notes.push(`History includes ${stats.seededCount} synthetic points.`);
  const { category: _c, claimedOriginal, ...product } = sp.product;
  return {
    product: { ...product, claimedOriginal: claimedOriginal ?? null, observedAt: new Date().toISOString() },
    history,
    stats,
    verdict: sp.verdict,
    dataNotes: notes,
  };
}

function toResponse(
  spec: WatchSpec,
  provenance: Provenance,
  r: { items: ScoredProduct[]; filteredOut: FilteredOut[] },
  extra: { fallbackReason?: string | null; cachedAt?: string | null } = {},
): ScoutResponse {
  return {
    runId: randomUUID(),
    generatedAt: new Date().toISOString(),
    provenance,
    fallbackReason: extra.fallbackReason ?? null,
    cachedAt: extra.cachedAt ?? null,
    spec,
    items: r.items.map(toItem),
    filteredOut: r.filteredOut,
  };
}

/** Wraps a live source so newly discovered products get clearly-labelled synthetic history. */
class SeedingSource implements PriceSource {
  name: string;
  private inner: PriceSource;
  private store: HistoryStore;
  constructor(inner: PriceSource, store: HistoryStore) {
    this.inner = inner;
    this.store = store;
    this.name = inner.name;
  }
  discover(spec: WatchSpec) {
    return this.inner.discover(spec);
  }
  async history(product: Product) {
    if (seedLiveHistory()) this.store.seedSynthetic(product.id, product.currentPrice);
    return this.inner.history(product);
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout;
  const timeout = new Promise<never>((_, rej) => (t = setTimeout(() => rej(new Error(`Live search timed out after ${Math.round(ms / 1000)}s`)), ms)));
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

async function liveScout(spec: WatchSpec): Promise<ScoutResponse> {
  const store = new HistoryStore(join(dataDir(), "history.json"));
  const source = new SeedingSource(new GeminiSource({ apiKey: process.env.GEMINI_API_KEY! }, store), store);
  const result = await withTimeout(scoutDetailed(spec, source), LIVE_TIMEOUT_MS);
  store.save();
  return toResponse(spec, "live", result);
}

export async function runScout(spec: WatchSpec, mode: ScoutMode): Promise<ScoutResponse> {
  let fallbackReason: string | null = null;

  if (mode !== "seeded") {
    if (!hasKey()) {
      if (mode === "live") throw new ApiError(502, "UPSTREAM_ERROR", "Live search is not configured on the server (GEMINI_API_KEY missing).");
    } else {
      try {
        const live = await liveScout(spec);
        const cache = readJson<Record<string, ScoutResponse>>(cacheFile(), {});
        cache[specKey(spec)] = live;
        writeJson(cacheFile(), cache);
        return live;
      } catch (err) {
        fallbackReason = (err as Error).message;
        if (mode === "live") throw new ApiError(502, "UPSTREAM_ERROR", fallbackReason);
        const cached = readJson<Record<string, ScoutResponse>>(cacheFile(), {})[specKey(spec)];
        if (cached) {
          return { ...cached, runId: randomUUID(), generatedAt: new Date().toISOString(), provenance: "cached", cachedAt: cached.generatedAt, fallbackReason, spec };
        }
      }
    }
  }
  const seeded = await scoutDetailed(spec, new MockSource());
  return toResponse(spec, "seeded", seeded, { fallbackReason });
}

// ---- Watches ----
const loadWatches = () => readJson<Watch[]>(watchesFile(), []);
const saveWatches = (w: Watch[]) => writeJson(watchesFile(), w);

// ---- HTTP plumbing ----
function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Handle the frozen frontend API. Returns true if the request was one of ours. */
export async function handleApi(req: IncomingMessage, res: ServerResponse, body: any, rawBodyBad: boolean): Promise<boolean> {
  const path = (req.url ?? "").split("?")[0];
  const method = req.method ?? "GET";
  const isNew = path === "/healthz" || path.startsWith("/api/spec") || path.startsWith("/api/digest") || path.startsWith("/api/watches") || (path === "/api/scout" && body?.spec);
  if (!isNew) return false;

  try {
    if (rawBodyBad && method !== "GET" && method !== "DELETE") throw bad("Request body must be valid JSON.");

    if (method === "GET" && path === "/healthz") return send(res, 200, { ok: true, version: "0.1.0" }), true;

    if (method === "POST" && path === "/api/spec") {
      const request = typeof body?.request === "string" ? body.request.trim() : "";
      if (request.length < 5 || request.length > 500) throw bad("Describe what you need in 5 to 500 characters.");
      const { spec, via } = await buildWatchSpec(request);
      const warnings: string[] = [];
      if (via === "heuristic") warnings.push("Gemini was not used, so this is basic parsing. Check each field.");
      if (spec.needsClarification) warnings.push("No budget found, so 15,000 is a placeholder.");
      return send(res, 200, { spec, via, warnings }), true;
    }

    if (method === "POST" && path === "/api/scout") {
      const result = await runScout(parseSpec(body.spec), parseMode(body.mode));
      return send(res, 200, result), true;
    }

    if (method === "POST" && path === "/api/digest/preview") {
      const spec = parseSpec(body?.spec);
      const result = await runScout(spec, parseMode(body?.mode));
      const buy = result.items.filter((i) => i.verdict.label === "buy_now").length;
      const subject = `DealScout: ${buy} to buy now for ${spec.category} under ₹${spec.budget.toLocaleString("en-IN")}`;
      // The digest template renders from scored products; rebuild them from the response.
      const scored = result.items.map((i) => ({
        product: { ...i.product, claimedOriginal: i.product.claimedOriginal ?? undefined },
        history: [],
        verdict: i.verdict,
        fit: { level: "exact", summary: "", notes: [], overkill: false },
      })) as unknown as ScoredProduct[];
      return send(res, 200, { subject, html: renderHtml(spec, scored) }), true;
    }

    if (method === "POST" && path === "/api/digest/send") {
      parseSpec(body?.spec);
      parseEmail(body?.email);
      throw new ApiError(501, "NOT_IMPLEMENTED", "Email sending is not set up yet.");
    }

    if (method === "POST" && path === "/api/watches") {
      const watch: Watch = {
        id: randomUUID(),
        spec: parseSpec(body?.spec),
        email: parseEmail(body?.email),
        createdAt: new Date().toISOString(),
        lastCheckedAt: null,
        lastResult: null,
      };
      saveWatches([...loadWatches(), watch]);
      return send(res, 200, watch), true;
    }

    if (method === "GET" && path === "/api/watches") return send(res, 200, { watches: loadWatches() }), true;

    const m = path.match(/^\/api\/watches\/([^/]+)(\/check)?$/);
    if (m) {
      const [, id, check] = m;
      const all = loadWatches();
      const watch = all.find((w) => w.id === id);
      if (!watch) throw new ApiError(404, "NOT_FOUND", "That watch no longer exists.");
      if (method === "GET" && !check) return send(res, 200, watch), true;
      if (method === "POST" && check) {
        watch.lastResult = await runScout(watch.spec, "auto");
        watch.lastCheckedAt = new Date().toISOString();
        saveWatches(all);
        return send(res, 200, watch), true;
      }
      if (method === "DELETE" && !check) {
        saveWatches(all.filter((w) => w.id !== id));
        return send(res, 200, { deleted: true }), true;
      }
    }
    throw new ApiError(404, "NOT_FOUND", "Unknown endpoint.");
  } catch (err) {
    const e = err instanceof ApiError ? err : new ApiError(500, "INTERNAL", (err as Error).message || "Something went wrong.");
    send(res, e.status, { error: { code: e.code, message: e.message } });
    return true;
  }
}
