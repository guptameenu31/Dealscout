import type { WatchSpec } from "./types.ts";

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
  const category = /audio interface|sound card|interface/.test(lower) ? "audio interface" : query.split(/\b(?:with|for|under|below|within)\b|</i)[0].trim() || "product";
  const mustHaves: string[] = [];
  if (/phantom|48v|condenser/.test(lower)) mustHaves.push("48V phantom power");
  const inputs = lower.match(/(\d)[\s-]*inputs?/);
  if (inputs) mustHaves.push(`${inputs[1]} inputs`);
  if (/usb[- ]?c/.test(lower)) mustHaves.push("USB-C");
  const budget = parseBudget(query);
  return {
    query,
    category,
    budget: budget ?? 15000,
    mustHaves,
    niceToHaves: [],
    excluded: parseExcluded(query),
    currency: "INR",
    searchTerms: [category, `best ${category} India`],
    needsClarification: budget === undefined,
    clarificationQuestion: budget === undefined ? "What is the most you want to spend?" : null,
  };
}

/** "without X", "no X", "not X", "avoid X" up to the next comma or conjunction. */
export function parseExcluded(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(?:without|no|not|avoid|exclude)\s+([a-z0-9][a-z0-9 -]{1,30}?)(?=[,.;]|\s+(?:and|but|under|below|with|for)\b|$)/gi)) out.push(m[1].trim());
  return [...new Set(out)];
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    category: { type: "STRING" },
    budget: { type: "NUMBER", description: "Maximum budget in INR" },
    mustHaves: { type: "ARRAY", items: { type: "STRING" } },
    niceToHaves: { type: "ARRAY", items: { type: "STRING" } },
    searchTerms: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["category", "budget", "mustHaves", "niceToHaves", "searchTerms"],
};

/** Gemini turns plain English into a watch spec; falls back to the heuristic on any failure. */
export async function buildWatchSpec(query: string): Promise<{ spec: WatchSpec; via: "gemini" | "heuristic" }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { spec: heuristicSpec(query), via: "heuristic" };

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
                text: `Turn this shopping request into a watch spec for Indian retailers. Budget is in INR. Keep must-haves to hard requirements only.\n\nRequest: ${query}`,
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
    return { spec: { excluded: [], currency: "INR", needsClarification: false, clarificationQuestion: null, ...parsed, query }, via: "gemini" };
  } catch (err) {
    console.warn(`Gemini spec failed (${(err as Error).message}); using heuristic.`);
    return { spec: heuristicSpec(query), via: "heuristic" };
  }
}
