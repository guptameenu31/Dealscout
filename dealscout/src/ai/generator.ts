import { setTimeout as delay } from "node:timers/promises";
import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { Config } from "../config.ts";

/** A web page Google Search returned while grounding an answer. */
export interface GroundingSource {
  title: string;
  uri: string;
  /** Site domain when the backend provides it (Vertex AI does; the Gemini API usually puts the domain in `title`). */
  domain?: string;
}

export interface GenerateRequest {
  prompt: string;
  /** JSON Schema for structured output. The response text is then JSON. */
  jsonSchema?: object;
  /** Let Gemini use Google Search and return the sources it used. */
  googleSearch?: boolean;
  /** Gemini 3 reasoning depth. "low" is much faster for search/extraction; omitted = model default (high). */
  thinkingLevel?: ThinkingDepth;
  /** Model for this call only; omitted = the generator's default model. */
  model?: string;
  signal?: AbortSignal;
  /** Names the pipeline step in the per-call log line (e.g. "details: Sony WF-C700N"). */
  label?: string;
}

export type ThinkingDepth = "low" | "medium" | "high";

/** Model + thinking depth for one pipeline step; spread into a GenerateRequest. */
export interface StepModel {
  model: string;
  thinkingLevel: ThinkingDepth;
}

/** Per-step models (GEMINI_*_MODEL, each defaulting to GEMINI_MODEL). Thinking depths per plan-v1.1 §3. */
export function stepModels(config: Config): { spec: StepModel; research: StepModel; validator: StepModel; advisor: StepModel } {
  return {
    spec: { model: config.GEMINI_SPEC_MODEL ?? config.GEMINI_MODEL, thinkingLevel: "low" },
    research: { model: config.GEMINI_RESEARCH_MODEL ?? config.GEMINI_MODEL, thinkingLevel: "medium" },
    validator: { model: config.GEMINI_VALIDATOR_MODEL ?? config.GEMINI_MODEL, thinkingLevel: "low" },
    advisor: { model: config.GEMINI_ADVISOR_MODEL ?? config.GEMINI_MODEL, thinkingLevel: "low" },
  };
}

const THINKING_LEVELS: Record<ThinkingDepth, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

export interface GenerateResult {
  text: string;
  sources: GroundingSource[];
}

/**
 * The only interface the app uses to talk to Gemini.
 * Production: GenAIGenerator (Google's @google/genai SDK). Tests: a fake.
 */
export interface TextGenerator {
  readonly model: string;
  readonly backend: "vertex-ai" | "gemini-api";
  generate(req: GenerateRequest): Promise<GenerateResult>;
}

export class GenAIGenerator implements TextGenerator {
  readonly model: string;
  readonly backend: "vertex-ai" | "gemini-api";
  private ai: GoogleGenAI;
  private log: (line: string) => void;

  constructor(ai: GoogleGenAI, model: string, backend: "vertex-ai" | "gemini-api", log: (line: string) => void = console.log) {
    this.ai = ai;
    this.model = model;
    this.backend = backend;
    this.log = log;
  }

  /**
   * One log line per call: duration, search queries run and token counts, to tell slow search rounds,
   * long thinking and slow serving apart. Never logs prompts or answers.
   */
  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const model = req.model ?? this.model;
    const what = `${req.label ?? "call"} [${model}, ${req.thinkingLevel ?? "default"} thinking]`;
    const started = Date.now();
    let res: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;
    try {
      res = await this.callSdk(req, model);
    } catch (err) {
      this.log(`gemini: ${what} failed after ${Date.now() - started}ms: ${String((err as Error)?.message ?? err).slice(0, 200)}`);
      throw err;
    }
    const u = res.usageMetadata;
    const searches = res.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length ?? 0;
    this.log(
      `gemini: ${what} ${Date.now() - started}ms, ${searches} searches, ` +
        `tokens: ${u?.thoughtsTokenCount ?? 0} thinking, ${u?.candidatesTokenCount ?? 0} output, ` +
        `${u?.promptTokenCount ?? 0} prompt, ${u?.toolUsePromptTokenCount ?? 0} search results`,
    );
    return this.parse(res);
  }

  private callSdk(req: GenerateRequest, model: string) {
    return this.ai.models.generateContent({
      model,
      contents: req.prompt,
      config: {
        abortSignal: req.signal,
        temperature: 0.2, // extraction work: favour consistency over creativity
        ...(req.googleSearch ? { tools: [{ googleSearch: {} }] } : {}),
        ...(req.thinkingLevel ? { thinkingConfig: { thinkingLevel: THINKING_LEVELS[req.thinkingLevel] } } : {}),
        ...(req.jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: req.jsonSchema } : {}),
      },
    });
  }

  private parse(res: Awaited<ReturnType<GenAIGenerator["callSdk"]>>): GenerateResult {
    const text = res.text ?? "";
    if (!text) throw new Error("Gemini returned an empty response");
    const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    const sources: GroundingSource[] = chunks
      .map((c) => c.web)
      .filter((w): w is NonNullable<typeof w> => !!w?.uri)
      .map((w) => ({ title: w.title ?? "", uri: w.uri!, domain: w.domain }));
    return { text, sources };
  }
}

/**
 * The model to switch to when `model` is overloaded: fallbackModel, or defaultModel when the call is already on the
 * fallback. Vertex capacity is per model, so retrying on the same model at a busy time rarely helps.
 */
export function otherModel(model: string, fallbackModel: string | undefined, defaultModel: string): string {
  if (!fallbackModel) return model;
  return fallbackModel !== model ? fallbackModel : defaultModel;
}

/** 408, 429 and 5xx from Gemini, plus network failures (fetch() throws a TypeError). Never aborts or 4xx. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof ApiError) return [408, 429, 500, 502, 503, 504].includes(err.status);
  const name = (err as Error)?.name;
  if (name === "AbortError" || name === "TimeoutError") return false;
  return err instanceof TypeError;
}

const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 16_000;

const errorSummary = (err: unknown) => (err instanceof ApiError ? String(err.status) : String((err as Error)?.message ?? err).slice(0, 80));

export interface RetryOptions {
  log?: (line: string) => void;
  /** Injected in tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<unknown>;
  random?: () => number;
}

/**
 * Retries transient Gemini failures (429 "Resource exhausted", 5xx, network) with exponential backoff and full
 * jitter, alternating between the call's model and otherModel(). The thinking level is never changed. The jitter
 * spreads out the parallel details calls that all get a 429 at the same moment. The caller's signal bounds the whole
 * thing, including the sleeps.
 */
export class RetryingGenerator implements TextGenerator {
  readonly model: string;
  readonly backend: "vertex-ai" | "gemini-api";
  private inner: TextGenerator;
  private fallbackModel: string | undefined;
  private attempts: number;
  private log: (line: string) => void;
  private sleep: (ms: number, signal?: AbortSignal) => Promise<unknown>;
  private random: () => number;

  constructor(inner: TextGenerator, fallbackModel: string | undefined, attempts: number, opts: RetryOptions = {}) {
    this.inner = inner;
    this.model = inner.model;
    this.backend = inner.backend;
    this.fallbackModel = fallbackModel;
    this.attempts = Math.max(1, attempts);
    this.log = opts.log ?? console.log;
    this.sleep = opts.sleep ?? ((ms, signal) => delay(ms, undefined, { signal }));
    this.random = opts.random ?? Math.random;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const first = req.model ?? this.model;
    const models = [first, otherModel(first, this.fallbackModel, this.model)];
    const what = req.label ?? first;
    let lastError: unknown;
    for (let i = 0; i < this.attempts; i++) {
      const model = models[i % 2];
      if (i > 0) {
        const ms = Math.round(this.random() * Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (i - 1)));
        this.log(`gemini: ${what}: attempt ${i + 1}/${this.attempts} on ${model} in ${ms}ms after ${errorSummary(lastError)} on ${models[(i - 1) % 2]}`);
        await this.sleep(ms, req.signal);
      }
      try {
        return await this.inner.generate(i === 0 ? req : { ...req, model, label: `${what} (retry ${i})` });
      } catch (err) {
        lastError = err;
        if (!isRetryable(err) || req.signal?.aborted) throw err;
      }
    }
    throw lastError;
  }
}

/**
 * Hedged Gemini calls. Grounded calls sometimes stall until the 120 s step timeout (Oct 15 logs: 502s at exactly
 * 120 s while sibling calls answered in 8-72 s), and a stall never errors, so retries can't help. If a call hasn't
 * answered after hedgeAfterMs, one backup call starts on otherModel() at the same thinking level; the first answer
 * wins and the other is cancelled. Fast failures are left to the RetryingGenerator inside.
 */
export class HedgedGenerator implements TextGenerator {
  readonly model: string;
  readonly backend: "vertex-ai" | "gemini-api";
  private inner: TextGenerator;
  private hedgeAfterMs: number;
  private fallbackModel: string | undefined;
  private log: (line: string) => void;

  constructor(inner: TextGenerator, hedgeAfterMs: number, fallbackModel?: string, log: (line: string) => void = console.log) {
    this.inner = inner;
    this.model = inner.model;
    this.backend = inner.backend;
    this.hedgeAfterMs = hedgeAfterMs;
    this.fallbackModel = fallbackModel;
    this.log = log;
  }

  generate(req: GenerateRequest): Promise<GenerateResult> {
    if (this.hedgeAfterMs <= 0) return this.inner.generate(req);
    const outer = req.signal;
    const linked = (c: AbortController) => (outer ? AbortSignal.any([outer, c.signal]) : c.signal);
    const primary = new AbortController();
    const backup = new AbortController();
    const what = req.label ?? req.model ?? this.model;
    const started = Date.now();

    return new Promise((resolve, reject) => {
      let timer: NodeJS.Timeout | undefined;
      let hedged = false;
      let done = false;
      let pending = 0;
      let firstError: unknown;

      const run = (r: GenerateRequest, which: "primary" | "backup") => {
        pending++;
        this.inner.generate(r).then(
          (res) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            (which === "primary" ? backup : primary).abort();
            if (hedged) this.log(`gemini: ${what}: ${which} answered first, after ${Date.now() - started}ms`);
            resolve(res);
          },
          (err) => {
            if (done) return;
            firstError ??= err;
            pending--;
            if (pending === 0) {
              done = true;
              clearTimeout(timer);
              reject(firstError);
            }
          },
        );
      };
      const startBackup = () => {
        if (hedged || done) return;
        hedged = true;
        const model = otherModel(req.model ?? this.model, this.fallbackModel, this.model);
        this.log(`gemini: ${what}: backup call on ${model} after ${Date.now() - started}ms, no answer yet`);
        run({ ...req, model, signal: linked(backup), label: `${what} (backup)` }, "backup");
      };

      timer = setTimeout(startBackup, this.hedgeAfterMs);
      run({ ...req, signal: linked(primary) }, "primary");
    });
  }
}

/**
 * Vertex AI (Google Cloud project + service account / ADC; used on Cloud Run) when
 * GOOGLE_GENAI_USE_VERTEXAI=true, otherwise the Gemini API with GEMINI_API_KEY. Null = AI not configured.
 * Transient failures are retried up to GEMINI_RETRY_ATTEMPTS times and calls are hedged after GEMINI_HEDGE_MS
 * (0 = off), both switching between the step's model and GEMINI_FALLBACK_MODEL.
 */
export function createGenerator(config: Config): TextGenerator | null {
  const hedged = (inner: GenAIGenerator) =>
    new HedgedGenerator(
      new RetryingGenerator(inner, config.GEMINI_FALLBACK_MODEL, config.GEMINI_RETRY_ATTEMPTS),
      config.GEMINI_HEDGE_MS,
      config.GEMINI_FALLBACK_MODEL,
    );
  if (config.GOOGLE_GENAI_USE_VERTEXAI) {
    const ai = new GoogleGenAI({
      vertexai: true,
      project: config.GOOGLE_CLOUD_PROJECT,
      location: config.GOOGLE_CLOUD_LOCATION,
    });
    return hedged(new GenAIGenerator(ai, config.GEMINI_MODEL, "vertex-ai"));
  }
  if (config.GEMINI_API_KEY) {
    return hedged(new GenAIGenerator(new GoogleGenAI({ apiKey: config.GEMINI_API_KEY }), config.GEMINI_MODEL, "gemini-api"));
  }
  return null;
}
