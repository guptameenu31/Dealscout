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

const SCHEMA = {
  type: "OBJECT",
  properties: {
    category: { type: "STRING" },
    budget: { type: "NUMBER", description: "Maximum budget in INR" },
    mustHaves: { type: "ARRAY", items: { type: "STRING" } },
    niceToHaves: { type: "ARRAY", items: { type: "STRING" } },
    excluded: { type: "ARRAY", items: { type: "STRING" }, description: "Features the user explicitly does not want" },
    searchTerms: { type: "ARRAY", items: { type: "STRING" } },
    needsClarification: { type: "BOOLEAN", description: "True only if the request is too vague to search for" },
    clarificationQuestion: { type: "STRING", description: "One short question to ask when needsClarification is true" },
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

/** Gemini turns plain English into a watch spec; falls back to the heuristic on any failure. */
export async function buildWatchSpec(query: string): Promise<BuiltSpec> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return heuristicResult(query);

  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `Turn this shopping request into a watch spec for Indian retailers. Budget is in INR. Keep must-haves to hard requirements only, phrased as short feature names (e.g. "2 inputs", "48V phantom power"). Only set needsClarification if the request is too vague to search for.\n\nRequest: ${query}`,
              },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}`);
    const data: any = await res.json();
    const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
    const { spec, warnings } = normalizeSpec(query, parsed, parseBudget(query));
    return { spec, via: "gemini", warnings };
  } catch (err) {
    console.warn(`Gemini spec failed (${(err as Error).message}); using heuristic.`);
    return heuristicResult(query);
  }
}
