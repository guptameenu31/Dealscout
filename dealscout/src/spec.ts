import type { TextGenerator } from "./ai/generator.ts";
import type { WatchSpec } from "./types.ts";
import { DEFAULT_BUDGET, normalizeSpec } from "./watchSpec.ts";

/** Pull a rupee budget out of text like "under ₹15k", "Rs 15,000", "below 15000". */
export function parseBudget(text: string): number | undefined {
  const m = text.match(/(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|l|lakh)?/gi);
  if (!m) return undefined;
  const candidates = m
    .map((raw) => {
      const mm = raw.match(/(\d[\d,]*(?:\.\d+)?)\s*(k|l|lakh)?/i)!;
      const n = parseFloat(mm[1].replace(/,/g, ""));
      const unit = (mm[2] ?? "").toLowerCase();
      return unit === "k" ? n * 1_000 : unit === "l" || unit === "lakh" ? n * 100_000 : n;
    })
    .filter((n) => n >= 500);
  return candidates.length ? Math.max(...candidates) : undefined;
}

/** Offline fallback so the prototype works with no API key. */
export function heuristicSpec(query: string): WatchSpec {
  const lower = query.toLowerCase();
  const category = /audio interface|sound card|interface/.test(lower) ? "audio interface" : query.split(/under|below|<|within/i)[0].trim() || "product";
  const mustHaves: string[] = [];
  if (/phantom|48v|condenser/.test(lower)) mustHaves.push("48V phantom power");
  const inputs = lower.match(/(\d)[\s-]*inputs?/);
  if (inputs) mustHaves.push(`${inputs[1]} inputs`);
  if (/usb[- ]?c/.test(lower)) mustHaves.push("USB-C");
  return {
    query,
    category,
    budget: parseBudget(query) ?? DEFAULT_BUDGET,
    currency: "INR",
    mustHaves,
    niceToHaves: [],
    excluded: [],
    searchTerms: [category, `best ${category} India`],
    needsClarification: false,
    clarificationQuestion: null,
  };
}

/** JSON Schema for Gemini structured output (passed as responseJsonSchema). */
const SPEC_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", description: "Short product category, e.g. 'audio interface'" },
    budget: { type: "number", description: "Maximum budget in INR" },
    mustHaves: { type: "array", items: { type: "string" } },
    niceToHaves: { type: "array", items: { type: "string" } },
    excluded: { type: "array", items: { type: "string" }, description: "Features the user explicitly does not want" },
    searchTerms: { type: "array", items: { type: "string" } },
    needsClarification: { type: "boolean", description: "True only if the request is too vague to search for" },
    clarificationQuestion: { type: "string", description: "One short question to ask when needsClarification is true" },
  },
  required: ["category", "budget", "mustHaves", "niceToHaves", "excluded", "searchTerms", "needsClarification"],
};

export interface BuiltSpec {
  spec: WatchSpec;
  via: "gemini" | "heuristic";
  /** Things the user should double-check (e.g. an assumed budget). */
  warnings: string[];
}

function heuristicResult(query: string): BuiltSpec {
  const warnings =
    parseBudget(query) === undefined
      ? [`No budget found in your request; assumed ₹${DEFAULT_BUDGET.toLocaleString("en-IN")}. Edit it before searching.`]
      : [];
  return { spec: heuristicSpec(query), via: "heuristic", warnings };
}

/** Gemini turns plain English into a watch spec; falls back to the heuristic on any failure or without AI. */
export async function buildWatchSpec(query: string, generator: TextGenerator | null): Promise<BuiltSpec> {
  if (!generator) return heuristicResult(query);
  try {
    const res = await generator.generate({
      jsonSchema: SPEC_SCHEMA,
      prompt: `Turn this shopping request into a watch spec for Indian retailers. Budget is in INR. Keep must-haves to hard requirements only, phrased as short feature names (e.g. "2 inputs", "48V phantom power"). Only set needsClarification if the request is too vague to search for.

Request: ${query}`,
    });
    const { spec, warnings } = normalizeSpec(query, JSON.parse(res.text), parseBudget(query));
    return { spec, via: "gemini", warnings };
  } catch (err) {
    console.warn(`Gemini spec failed (${String((err as Error)?.message ?? err).slice(0, 200)}); using heuristic.`);
    return heuristicResult(query);
  }
}
