import { test } from "node:test";
import assert from "node:assert/strict";
import type { GenerateRequest, GenerateResult, TextGenerator } from "../src/ai/generator.ts";
import {
  normalizeDetails, normalizeShortlist, ResearchCache, researchAllDetails, researchDetails, shortlistModels, specKey,
  type ModelDetails,
} from "../src/ai/research.ts";
import { mapLimit } from "../src/mapLimit.ts";
import { heuristicSpec } from "../src/spec.ts";

const step = { model: "research-model", thinkingLevel: "medium" as const };
const spec = { ...heuristicSpec("ANC earbuds under 10k"), mustHaves: ["active noise cancellation"], niceToHaves: ["long battery"] };

function fakeGenerator(...results: (GenerateResult | Error)[]) {
  const requests: GenerateRequest[] = [];
  const gen: TextGenerator = {
    model: "fake",
    backend: "gemini-api",
    async generate(req) {
      requests.push(req);
      const next = results.shift();
      if (!next) throw new Error("no more fake results");
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { gen, requests };
}
const json = (v: unknown): GenerateResult => ({ text: JSON.stringify(v), sources: [] });
const pick = (name: string, stretch = false) => ({ name, stretch, why: "fits" });

test("normalizeShortlist: ≤5 in budget + ≤2 stretch, slug IDs, dedupe, junk dropped", () => {
  const models = normalizeShortlist({
    models: [
      ...["A", "B", "C", "D", "E", "F"].map((n) => pick(`Brand ${n}`)),
      pick("Brand A"),
      pick("Stretch 1", true), pick("Stretch 2", true), pick("Stretch 3", true),
      { name: "" }, "junk", null, { name: "Odd", stretch: "yes", why: 5 },
    ],
  });
  assert.deepEqual(models.map((m) => [m.id, m.stretch]), [
    ["brand-a", false], ["brand-b", false], ["brand-c", false], ["brand-d", false], ["brand-e", false],
    ["stretch-1", true], ["stretch-2", true],
  ]);
  assert.deepEqual(normalizeShortlist("junk"), []);
});

test("shortlistModels: ONE call with search + schema, research step, today's date; failures throw", async () => {
  const { gen, requests } = fakeGenerator(json({ models: [pick("OnePlus Buds 3"), pick("OnePlus Buds Pro 3", true)] }));
  const r = await shortlistModels(spec, gen, step);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].googleSearch, true);
  assert.ok(requests[0].jsonSchema);
  assert.equal(requests[0].model, "research-model");
  assert.equal(requests[0].thinkingLevel, "medium");
  assert.match(requests[0].prompt, new RegExp(`^Today is ${new Date().toISOString().slice(0, 10)}\\.`));
  assert.match(requests[0].prompt, /Do NOT give prices or links/);
  assert.deepEqual(r.models.map((m) => m.id), ["oneplus-buds-3", "oneplus-buds-pro-3"]);

  await assert.rejects(shortlistModels(spec, fakeGenerator({ text: "{oops", sources: [] }).gen, step), /invalid JSON/);
  await assert.rejects(shortlistModels(spec, fakeGenerator(json({ models: [] })).gen, step), /no models/);
  await assert.rejects(shortlistModels(spec, fakeGenerator(new Error("429")).gen, step), /429/);
});

test("normalizeDetails: one check per must-have in the user's wording; junk becomes safe defaults", () => {
  const d = normalizeDetails("m", {
    whyFits: " good ", keySpecs: [1, "6.5 h with ANC", ""], community: 3,
    mustHaveChecks: [{ requirement: "ACTIVE NOISE CANCELLATION", result: "yes", evidence: "49 dB" }],
  }, ["active noise cancellation", "true wireless"]);
  assert.deepEqual(d, {
    modelId: "m", whyFits: "good", keySpecs: ["6.5 h with ANC"], community: "", concerns: [],
    mustHaveChecks: [
      { req: "active noise cancellation", result: "yes", evidence: "49 dB" },
      { req: "true wireless", result: "unknown", evidence: "" },
    ],
  });
  assert.equal(normalizeDetails("m", "junk", []).whyFits, "");
});

test("researchDetails: one grounded schema call per model, prompt names the model and nice-to-haves", async () => {
  const { gen, requests } = fakeGenerator(json({ whyFits: "w", keySpecs: [], mustHaveChecks: [], community: "", concerns: [] }));
  const d = await researchDetails(spec, { id: "sony", name: "Sony WF-C700N" }, gen, step);
  assert.equal(d.modelId, "sony");
  assert.equal(requests[0].googleSearch, true);
  assert.ok(requests[0].jsonSchema);
  assert.match(requests[0].prompt, /^Today is /);
  assert.match(requests[0].prompt, /Sony WF-C700N/);
  assert.match(requests[0].prompt, /long battery/);
});

test("researchAllDetails: per-model errors isolated; must-have 'no' → filteredOut", async () => {
  const models = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }];
  const details = (modelId: string, result: "yes" | "no"): ModelDetails => ({
    modelId, whyFits: "", keySpecs: [], community: "", concerns: [],
    mustHaveChecks: [{ req: "active noise cancellation", result, evidence: result === "no" ? "no ANC" : "" }],
  });
  const r = await researchAllDetails(models, async (m) => {
    if (m.id === "b") throw new Error("Gemini 429");
    return details(m.id, m.id === "c" ? "no" : "yes");
  });
  assert.equal((r.details[0] as ModelDetails).modelId, "a");
  assert.deepEqual(r.details[1], { modelId: "b", error: "Details failed: Gemini 429" });
  assert.deepEqual(r.filteredOut, [{ modelId: "c", name: "C", reason: 'Does not meet "active noise cancellation": no ANC' }]);
});

test("mapLimit: keeps order, captures errors, never exceeds the limit", async () => {
  let inFlight = 0;
  let peak = 0;
  const r = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    peak = Math.max(peak, ++inFlight);
    await new Promise((res) => setTimeout(res, 5));
    inFlight--;
    if (n === 4) throw new Error("four");
    return n * 10;
  });
  assert.equal(peak, 3);
  assert.deepEqual(r.map((x) => (x.status === "fulfilled" ? x.value : (x.reason as Error).message)), [10, 20, 30, "four", 50, 60, 70]);
  assert.deepEqual(await mapLimit([], 3, async () => 1), []);
});

test("ResearchCache + specKey: same need hits within 24h, expires after", () => {
  const cache = new ResearchCache<string>();
  cache.set(specKey(spec), "v", 0);
  assert.equal(cache.get(specKey({ ...spec, mustHaves: ["ACTIVE NOISE CANCELLATION"] }), 1000), "v");
  assert.equal(cache.get(specKey({ ...spec, budget: spec.budget + 1 }), 1000), undefined);
  assert.equal(cache.get(specKey(spec), 25 * 60 * 60 * 1000), undefined);
});
