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
 * Vertex AI (Google Cloud project + service account / ADC; used on Cloud Run) when
 * GOOGLE_GENAI_USE_VERTEXAI=true, otherwise the Gemini API with GEMINI_API_KEY. Null = AI not configured.
 */
export function createGenerator(config: Config): TextGenerator | null {
  if (config.GOOGLE_GENAI_USE_VERTEXAI) {
    const ai = new GoogleGenAI({
      vertexai: true,
      project: config.GOOGLE_CLOUD_PROJECT,
      location: config.GOOGLE_CLOUD_LOCATION,
    });
    return new GenAIGenerator(ai, config.GEMINI_MODEL, "vertex-ai");
  }
  if (config.GEMINI_API_KEY) {
    return new GenAIGenerator(new GoogleGenAI({ apiKey: config.GEMINI_API_KEY }), config.GEMINI_MODEL, "gemini-api");
  }
  return null;
}
