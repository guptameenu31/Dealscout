import { GoogleGenAI, ThinkingLevel } from "@google/genai";
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

  constructor(ai: GoogleGenAI, model: string, backend: "vertex-ai" | "gemini-api") {
    this.ai = ai;
    this.model = model;
    this.backend = backend;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const res = await this.ai.models.generateContent({
      model: req.model ?? this.model,
      contents: req.prompt,
      config: {
        abortSignal: req.signal,
        temperature: 0.2, // extraction work: favour consistency over creativity
        ...(req.googleSearch ? { tools: [{ googleSearch: {} }] } : {}),
        ...(req.thinkingLevel ? { thinkingConfig: { thinkingLevel: THINKING_LEVELS[req.thinkingLevel] } } : {}),
        ...(req.jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: req.jsonSchema } : {}),
      },
    });
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
 * Hedged Gemini calls. Grounded calls sometimes stall until the 120 s step timeout (Oct 15 logs: 502s at exactly
 * 120 s while sibling calls answered in 8-72 s). If a call hasn't answered after hedgeAfterMs, or fails before then,
 * one backup call starts at low thinking; the first answer wins and the other is cancelled.
 */
export class HedgedGenerator implements TextGenerator {
  readonly model: string;
  readonly backend: "vertex-ai" | "gemini-api";
  private inner: TextGenerator;
  private hedgeAfterMs: number;
  private log: (line: string) => void;

  constructor(inner: TextGenerator, hedgeAfterMs: number, log: (line: string) => void = console.log) {
    this.inner = inner;
    this.model = inner.model;
    this.backend = inner.backend;
    this.hedgeAfterMs = hedgeAfterMs;
    this.log = log;
  }

  generate(req: GenerateRequest): Promise<GenerateResult> {
    if (this.hedgeAfterMs <= 0) return this.inner.generate(req);
    const outer = req.signal;
    const linked = (c: AbortController) => (outer ? AbortSignal.any([outer, c.signal]) : c.signal);
    const primary = new AbortController();
    const backup = new AbortController();
    const model = req.model ?? this.model;
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
            if (hedged) this.log(`gemini: ${which} answered after ${Date.now() - started}ms (${model})`);
            resolve(res);
          },
          (err) => {
            if (done) return;
            firstError ??= err;
            pending--;
            if (which === "primary" && !hedged && !outer?.aborted) return startBackup("primary failed");
            if (pending === 0) {
              done = true;
              clearTimeout(timer);
              reject(firstError);
            }
          },
        );
      };
      const startBackup = (why: string) => {
        if (hedged || done) return;
        hedged = true;
        clearTimeout(timer);
        this.log(`gemini: backup call at low thinking after ${Date.now() - started}ms, ${why} (${model})`);
        run({ ...req, thinkingLevel: "low", signal: linked(backup) }, "backup");
      };

      timer = setTimeout(() => startBackup("no answer yet"), this.hedgeAfterMs);
      run({ ...req, signal: linked(primary) }, "primary");
    });
  }
}

/**
 * Vertex AI (Google Cloud project + service account / ADC; used on Cloud Run) when
 * GOOGLE_GENAI_USE_VERTEXAI=true, otherwise the Gemini API with GEMINI_API_KEY. Null = AI not configured.
 * Calls are hedged after GEMINI_HEDGE_MS (0 = off).
 */
export function createGenerator(config: Config): TextGenerator | null {
  if (config.GOOGLE_GENAI_USE_VERTEXAI) {
    const ai = new GoogleGenAI({
      vertexai: true,
      project: config.GOOGLE_CLOUD_PROJECT,
      location: config.GOOGLE_CLOUD_LOCATION,
    });
    return new HedgedGenerator(new GenAIGenerator(ai, config.GEMINI_MODEL, "vertex-ai"), config.GEMINI_HEDGE_MS);
  }
  if (config.GEMINI_API_KEY) {
    const ai = new GoogleGenAI({ apiKey: config.GEMINI_API_KEY });
    return new HedgedGenerator(new GenAIGenerator(ai, config.GEMINI_MODEL, "gemini-api"), config.GEMINI_HEDGE_MS);
  }
  return null;
}
