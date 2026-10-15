import { z } from "zod";
import { mapLimit } from "../mapLimit.ts";
import { slug } from "../sources/gemini.ts";
import type { WatchSpec } from "../types.ts";
import type { StepModel, TextGenerator } from "./generator.ts";

/**
 * Research (plan-v1.1 §2 ①), split for speed: Gemini + Google Search decides WHICH models to consider.
 *   1. shortlistModels: one call, names + one-line reason (~25 s at medium thinking)
 *   2. researchAllDetails: one call per model, all in parallel (~25 s wall), specs / must-have checks / community / concerns
 * Each call uses Google Search and a JSON schema together. Research never produces prices or links;
 * those come from Serper. Measured Oct 15: 108 s as one call vs ~52 s split, with better detail.
 */

export const MAX_IN_BUDGET = 5;
export const MAX_STRETCH = 2;
/** Stretch models may cost up to this share above the budget. */
export const STRETCH_SHARE = 0.3;
/**
 * Parallel detail calls per search. All of a search's models at once: a cap of 3 ran in waves and took 81 s vs 25 s
 * (Oct 15, no 429s at 7). Lower this if Vertex quota errors appear with several users.
 */
export const DETAIL_CONCURRENCY = MAX_IN_BUDGET + MAX_STRETCH;

export interface ShortlistModel {
  /** Slug of the name; ties details, Serper candidates and validator verdicts back to this model. */
  id: string;
  /** Name as sold in India; used as the Google Shopping query. */
  name: string;
  /** true = expected to cost up to 30% over budget. */
  stretch: boolean;
  why: string;
}

export interface Shortlist {
  models: ShortlistModel[];
  researchedAt: string;
}

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
  community: string;
  concerns: string[];
}

export interface DetailsResult {
  /** One entry per requested model, in order: details, or the error for that model alone. */
  details: (ModelDetails | { modelId: string; error: string })[];
  /** Models whose details show a must-have is not met; the UI hides them. */
  filteredOut: { modelId: string; name: string; reason: string }[];
}

const today = () => new Date().toISOString().slice(0, 10);
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const text = (max: number) =>
  z
    .string()
    .catch("")
    .transform((s) => s.trim().slice(0, max));
const list = (n: number, max: number) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((xs) => xs.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim().slice(0, max)).slice(0, n));

function parseJson(raw: string, what: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${what} returned invalid JSON`);
  }
}

// ---------- 1. Shortlist ----------

const SHORTLIST_SCHEMA = {
  type: "object",
  properties: {
    models: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Exact model name as Indian retailers list it: brand, model, generation/variant" },
          stretch: { type: "boolean", description: "true if it typically sells above the budget (up to 30% over)" },
          why: { type: "string", description: "One short sentence on why it fits this request" },
        },
        required: ["name", "stretch", "why"],
      },
    },
  },
  required: ["models"],
};

const RawShortlistModel = z.object({ name: text(120), stretch: z.boolean().catch(false), why: text(300) });

/** Untrusted shortlist output → ≤5 in-budget + ≤2 stretch models with unique slug IDs. */
export function normalizeShortlist(raw: unknown): ShortlistModel[] {
  const rows = Array.isArray((raw as { models?: unknown })?.models) ? (raw as { models: unknown[] }).models : [];
  const out: ShortlistModel[] = [];
  const seen = new Set<string>();
  let inBudget = 0;
  let stretch = 0;
  for (const row of rows) {
    const r = RawShortlistModel.safeParse(row ?? {});
    if (!r.success) continue;
    const id = slug(r.data.name);
    if (!r.data.name || !id || seen.has(id)) continue;
    if (r.data.stretch ? stretch >= MAX_STRETCH : inBudget >= MAX_IN_BUDGET) continue;
    seen.add(id);
    if (r.data.stretch) stretch++;
    else inBudget++;
    out.push({ id, ...r.data });
  }
  return out;
}

/** One grounded call that returns the shortlist as JSON. Throws on Gemini errors, invalid JSON or no models. */
export async function shortlistModels(spec: WatchSpec, generator: TextGenerator, step: StepModel, signal?: AbortSignal): Promise<Shortlist> {
  const must = spec.mustHaves.length ? `Must have: ${spec.mustHaves.join(", ")}.` : "";
  const nice = spec.niceToHaves.length ? `Nice to have: ${spec.niceToHaves.join(", ")}.` : "";
  const avoid = spec.excluded.length ? `Avoid: ${spec.excluded.join(", ")}.` : "";
  const res = await generator.generate({
    ...step,
    label: "shortlist",
    googleSearch: true,
    jsonSchema: SHORTLIST_SCHEMA,
    signal,
    prompt: `Today is ${today()}. Use Google Search to decide which ${spec.category} models a shopper in India should consider. Budget: ${inr(spec.budget)}. ${must} ${nice} ${avoid}
Pick up to ${MAX_IN_BUDGET} models that normally sell in India within the budget, plus up to ${MAX_STRETCH} "stretch" models that sell for up to ${inr(spec.budget * (1 + STRETCH_SHARE))} and are clearly better for this need. Only models currently sold new in India; prefer current models over discontinued ones.
Name each exactly as Indian retailers list it (brand, model, generation or variant), so the name works as a Google Shopping search. For each, give one short sentence on why it fits. Do NOT give prices or links.
User request: ${spec.query}`,
  });
  const models = normalizeShortlist(parseJson(res.text, "Research"));
  if (!models.length) throw new Error("Research found no models");
  return { models, researchedAt: new Date().toISOString() };
}

// ---------- 2. Details per model ----------

const DETAILS_SCHEMA = {
  type: "object",
  properties: {
    whyFits: { type: "string", description: "One or two sentences on why it fits this specific request" },
    keySpecs: { type: "array", items: { type: "string" } },
    mustHaveChecks: {
      type: "array",
      description: "One entry per must-have requirement listed in the instructions",
      items: {
        type: "object",
        properties: {
          requirement: { type: "string", description: "The requirement, copied exactly" },
          result: { type: "string", enum: ["yes", "no", "unknown"] },
          evidence: { type: "string", description: "Short supporting fact; empty if unknown" },
        },
        required: ["requirement", "result", "evidence"],
      },
    },
    community: { type: "string", description: "What reviewers and communities (Reddit, forums, YouTube) say, in one or two sentences" },
    concerns: { type: "array", items: { type: "string" } },
  },
  required: ["whyFits", "keySpecs", "mustHaveChecks", "community", "concerns"],
};

const RawDetails = z.object({
  whyFits: text(400),
  keySpecs: list(8, 160),
  mustHaveChecks: z
    .array(z.object({ requirement: z.string().catch(""), result: z.string().catch("unknown"), evidence: z.string().catch("") }).catch({ requirement: "", result: "unknown", evidence: "" }))
    .catch([]),
  community: text(500),
  concerns: list(5, 200),
});

/** Untrusted details output → clean details with exactly one check per must-have (in the user's wording). */
export function normalizeDetails(modelId: string, raw: unknown, mustHaves: string[]): ModelDetails {
  const d = RawDetails.parse(raw && typeof raw === "object" ? raw : {});
  const mustHaveChecks: MustHaveCheck[] = mustHaves.map((req) => {
    const c = d.mustHaveChecks.find((x) => x.requirement.trim().toLowerCase() === req.toLowerCase());
    const result = c?.result === "yes" || c?.result === "no" ? c.result : "unknown";
    return { req, result, evidence: (c?.evidence ?? "").trim().slice(0, 200) };
  });
  return { modelId, whyFits: d.whyFits, keySpecs: d.keySpecs, mustHaveChecks, community: d.community, concerns: d.concerns };
}

/** One grounded call researching a single model. Throws on Gemini errors or invalid JSON. */
export async function researchDetails(
  spec: WatchSpec,
  model: { id: string; name: string },
  generator: TextGenerator,
  step: StepModel,
  signal?: AbortSignal,
): Promise<ModelDetails> {
  const must = spec.mustHaves.length ? `Must have: ${spec.mustHaves.join(", ")}.` : "";
  const nice = spec.niceToHaves.length ? `Nice to have: ${spec.niceToHaves.join(", ")}.` : "";
  const checks = spec.mustHaves.length
    ? `Fill mustHaveChecks with exactly one entry for each of: ${JSON.stringify(spec.mustHaves)} ("yes" only if supported, "no" if contradicted, otherwise "unknown").`
    : "Leave mustHaveChecks empty.";
  const res = await generator.generate({
    ...step,
    label: `details: ${model.name}`,
    googleSearch: true,
    jsonSchema: DETAILS_SCHEMA,
    signal,
    prompt: `Today is ${today()}. Use Google Search to research the ${model.name} for this shopper in India. ${must} ${nice}
User request: ${spec.query}
Give: why it fits this specific need; key specs, including concrete figures for the nice-to-haves and the request (for example battery hours, weight, sizes); ${checks} what reviewers and communities such as Reddit, forums and YouTube say; and concerns. Do NOT give prices or links.`,
  });
  return normalizeDetails(model.id, parseJson(res.text, "Details"), spec.mustHaves);
}

const shortMessage = (err: unknown) => String((err as Error)?.message ?? err).slice(0, 200);

/** Details for every model, DETAIL_CONCURRENCY at a time. One model failing doesn't fail the others. */
export async function researchAllDetails(
  models: { id: string; name: string }[],
  research: (model: { id: string; name: string }) => Promise<ModelDetails>,
): Promise<DetailsResult> {
  const settled = await mapLimit(models, DETAIL_CONCURRENCY, research);
  const result: DetailsResult = { details: [], filteredOut: [] };
  models.forEach((m, i) => {
    const s = settled[i];
    if (s.status === "rejected") {
      result.details.push({ modelId: m.id, error: `Details failed: ${shortMessage(s.reason)}` });
      return;
    }
    result.details.push(s.value);
    const failed = s.value.mustHaveChecks.find((c) => c.result === "no");
    if (failed) {
      result.filteredOut.push({ modelId: m.id, name: m.name, reason: `Does not meet "${failed.req}"${failed.evidence ? `: ${failed.evidence}` : ""}` });
    }
  });
  return result;
}

// ---------- Cache ----------

/** Stable cache key for a spec (list order and case don't matter). */
export function specKey(spec: WatchSpec): string {
  const norm = (xs: string[]) => xs.map((x) => x.toLowerCase()).sort();
  return JSON.stringify([
    spec.category.toLowerCase(),
    spec.budget,
    norm(spec.mustHaves),
    norm(spec.niceToHaves),
    norm(spec.excluded),
    spec.query.trim().toLowerCase(),
  ]);
}

/** 24h in-memory cache (ephemeral on Cloud Run; fine for v1.1). Used for shortlists and per-model details. */
export class ResearchCache<T> {
  private entries = new Map<string, { at: number; value: T }>();
  private ttlMs: number;
  private max: number;

  constructor(ttlMs = 24 * 60 * 60 * 1000, max = 500) {
    this.ttlMs = ttlMs;
    this.max = max;
  }

  get(key: string, now = Date.now()): T | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (now - e.at > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    if (this.entries.size >= this.max) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { at: now, value });
  }
}
