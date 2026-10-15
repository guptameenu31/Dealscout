import { Router } from "express";
import { z } from "zod";
import type { StepModel, TextGenerator } from "../../ai/generator.ts";
import {
  MAX_IN_BUDGET, MAX_STRETCH, ResearchCache, researchAllDetails, researchDetails, shortlistModels, specKey,
  type ModelDetails, type Shortlist,
} from "../../ai/research.ts";
import { applyVerdicts, judgeListings } from "../../ai/validator.ts";
import { mapLimit } from "../../mapLimit.ts";
import { toCandidates, type Candidate, type SerperClient } from "../../sources/serper.ts";
import { WatchSpecSchema } from "../../watchSpec.ts";
import { AppError } from "../errors.ts";
import { validateBody } from "../middleware/validate.ts";

/**
 * The v1.1 search as short, stateless calls, so the UI can show real progress and no request runs too long:
 *   POST /api/research          { spec }                      → shortlist: ≤5 + ≤2 stretch model names (~25 s)
 *   then, in parallel:
 *   POST /api/research/details  { spec, models }              → specs, must-have checks, community, concerns (~25 s)
 *   POST /api/offers            { models }                    → top-k Serper Google Shopping listings per model (~6 s)
 *   POST /api/validate          { spec, models, candidates }  → Gemini accepts/rejects listings; code builds prices (~15 s)
 * The client passes each step's output to the next. If validate fails, retry it: no Serper credits are spent again.
 */

export interface PipelineDeps {
  generator: TextGenerator | null;
  serper: SerperClient | null;
  steps: { research: StepModel; validator: StepModel };
  topK: number;
  shortlistCache: ResearchCache<Shortlist>;
  detailsCache: ResearchCache<ModelDetails>;
  /** Per-step Gemini timeouts. Default 120 s each. */
  researchTimeoutMs?: number;
  validateTimeoutMs?: number;
}

const MAX_MODELS = MAX_IN_BUDGET + MAX_STRETCH;
/** Serper reports rateLimit 5 for this account; stay at or under it. */
const SERPER_CONCURRENCY = 5;
const MODEL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const ModelRef = z.object({
  id: z.string().max(120).regex(MODEL_ID),
  name: z.string().trim().min(1).max(120),
});
const PricedModelSchema = ModelRef.extend({ stretch: z.boolean().default(false) });

const CandidateSchema = z.object({
  id: z.string().max(124).regex(/^[a-z0-9-]+#\d{1,2}$/),
  modelId: z.string().max(120).regex(MODEL_ID),
  title: z.string().min(1).max(300),
  store: z.string().min(1).max(100),
  pricePaise: z.number().int().positive().max(1_000_000_000),
  link: z.url({ protocol: /^https?$/ }).max(2000),
  linkType: z.enum(["shopping", "search"]),
  googleProductId: z.string().max(40).nullable(),
  imageUrl: z.url({ protocol: /^https$/ }).max(2000).nullable().default(null),
  observedAt: z.iso.datetime(),
});

const ResearchRequest = z.object({ spec: WatchSpecSchema });
const DetailsRequest = z.object({ spec: WatchSpecSchema, models: z.array(ModelRef).min(1).max(MAX_MODELS) });
const OffersRequest = z.object({ models: z.array(ModelRef).min(1).max(MAX_MODELS) });
const ValidateRequest = z
  .object({
    spec: WatchSpecSchema,
    models: z.array(PricedModelSchema).min(1).max(MAX_MODELS),
    candidates: z.array(CandidateSchema).max(MAX_MODELS * 20),
  })
  .refine((b) => b.candidates.every((c) => c.id.startsWith(`${c.modelId}#`) && b.models.some((m) => m.id === c.modelId)), {
    message: "Every candidate must belong to one of the models",
    path: ["candidates"],
  });

const shortMessage = (err: unknown) => String((err as Error)?.message ?? err).slice(0, 200);

export function pipelineRouter(deps: PipelineDeps): Router {
  const r = Router();
  const researchTimeoutMs = deps.researchTimeoutMs ?? 120_000;
  const validateTimeoutMs = deps.validateTimeoutMs ?? 120_000;
  const requireAi = (what: string) => {
    if (!deps.generator) throw new AppError(501, "NOT_IMPLEMENTED", `${what} is not configured on this server.`);
    return deps.generator;
  };

  r.post("/research", validateBody(ResearchRequest), async (req, res) => {
    const { spec } = req.body as z.infer<typeof ResearchRequest>;
    const key = specKey(spec);
    const cached = deps.shortlistCache.get(key);
    if (cached) return void res.json({ ...cached, cached: true });
    const generator = requireAi("AI research");
    const started = Date.now();
    let shortlist: Shortlist;
    try {
      shortlist = await shortlistModels(spec, generator, deps.steps.research, AbortSignal.timeout(researchTimeoutMs));
    } catch (err) {
      throw new AppError(502, "UPSTREAM_ERROR", `Research failed: ${shortMessage(err)}`);
    }
    deps.shortlistCache.set(key, shortlist);
    console.log(`research: ${shortlist.models.length} models in ${Date.now() - started}ms`);
    res.json({ ...shortlist, cached: false });
  });

  r.post("/research/details", validateBody(DetailsRequest), async (req, res) => {
    const { spec, models } = req.body as z.infer<typeof DetailsRequest>;
    const generator = requireAi("AI research");
    const started = Date.now();
    const signal = AbortSignal.timeout(researchTimeoutMs);
    const prefix = specKey(spec);
    const result = await researchAllDetails(models, async (m) => {
      const key = `${prefix}|${m.id}`;
      const hit = deps.detailsCache.get(key);
      if (hit) return hit;
      const t = Date.now();
      const d = await researchDetails(spec, m, generator, deps.steps.research, signal);
      console.log(`details: ${m.name} in ${Date.now() - t}ms`);
      deps.detailsCache.set(key, d);
      return d;
    });
    const failed = result.details.filter((d) => "error" in d).length;
    if (failed === models.length) throw new AppError(502, "UPSTREAM_ERROR", (result.details[0] as { error: string }).error);
    console.log(`details: ${models.length - failed}/${models.length} models, ${result.filteredOut.length} filtered out in ${Date.now() - started}ms`);
    res.json(result);
  });

  r.post("/offers", validateBody(OffersRequest), async (req, res) => {
    const { models } = req.body as z.infer<typeof OffersRequest>;
    const serper = deps.serper;
    if (!serper) throw new AppError(501, "NOT_IMPLEMENTED", "Price search is not configured on this server.");
    const started = Date.now();
    const observedAt = new Date().toISOString();
    const settled = await mapLimit(models, SERPER_CONCURRENCY, (m) => serper.shopping(m.name));
    const results = models.map((m, i) => {
      const s = settled[i];
      return s.status === "fulfilled"
        ? { modelId: m.id, name: m.name, candidates: toCandidates(m.id, s.value, deps.topK, observedAt), error: null }
        : { modelId: m.id, name: m.name, candidates: [] as Candidate[], error: `Price lookup failed: ${shortMessage(s.reason)}` };
    });
    if (results.every((x) => x.error)) throw new AppError(502, "UPSTREAM_ERROR", results[0].error!);
    console.log(`offers: ${models.length} models, ${results.reduce((n, x) => n + x.candidates.length, 0)} candidates in ${Date.now() - started}ms`);
    res.json({ observedAt, results });
  });

  r.post("/validate", validateBody(ValidateRequest), async (req, res) => {
    const { spec, models, candidates } = req.body as z.infer<typeof ValidateRequest>;
    const generator = requireAi("AI validation");
    const started = Date.now();
    let verdicts;
    try {
      verdicts = await judgeListings(spec, models, candidates, generator, deps.steps.validator, AbortSignal.timeout(validateTimeoutMs));
    } catch (err) {
      throw new AppError(502, "UPSTREAM_ERROR", `Validation failed: ${shortMessage(err)}`);
    }
    const result = applyVerdicts(spec, models, candidates, verdicts);
    console.log(`validate: ${candidates.length} listings → ${result.items.length} models priced in ${Date.now() - started}ms`);
    res.json({ generatedAt: new Date().toISOString(), spec, ...result, advice: null });
  });

  return r;
}
