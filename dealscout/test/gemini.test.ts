import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GenerateRequest, GenerateResult, TextGenerator } from "../src/ai/generator.ts";
import { createGenerator, stepModels } from "../src/ai/generator.ts";
import { loadConfig } from "../src/config.ts";
import { GeminiSource, linkInSources } from "../src/sources/gemini.ts";
import { HistoryStore } from "../src/historyStore.ts";
import { buildWatchSpec, heuristicSpec } from "../src/spec.ts";
import { evaluateMustHaves, scoutDetailed } from "../src/scout.ts";

const newStore = () => new HistoryStore(join(mkdtempSync(join(tmpdir(), "ds-")), "h.json"));

/** Fake Gemini: returns the queued results in order and records every request. */
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

const sources = [{ title: "amazon.in", uri: "https://vertexaisearch.cloud.google.com/grounding/abc" }];
const spec = { ...heuristicSpec("2-input audio interface under 15k"), mustHaves: ["2 inputs"] };

test("discover: grounded search call, then structured extraction; junk rows dropped", async () => {
  const { gen, requests } = fakeGenerator(
    { text: "Some search findings", sources },
    {
      text: JSON.stringify([
        { name: "Good One", store: "Amazon.in", url: "https://www.amazon.in/1", currentPrice: 9999, claimedOriginal: 14999, features: ["2 inputs"],
          requirementChecks: [{ requirement: "2 inputs", met: "yes", evidence: "2 combo inputs" }] },
        { name: "Good One", store: "Amazon.in", url: "https://www.amazon.in/1", currentPrice: 9999, features: [], requirementChecks: [] }, // duplicate
        { name: "No Url", store: "X", url: "unknown", currentPrice: 5000, features: [], requirementChecks: [] },
        { name: "No Price", store: "X", url: "https://x.in", currentPrice: 0, features: [], requirementChecks: [] },
        { name: "Bad MRP", store: "Flipkart", url: "https://www.flipkart.com/2", currentPrice: 8000, claimedOriginal: 7000, features: [],
          requirementChecks: [{ requirement: "2 INPUTS", met: "maybe", evidence: "" }, { requirement: "invented", met: "yes", evidence: "x" }] },
      ]),
      sources: [],
    },
  );
  const products = await new GeminiSource({ generator: gen }, newStore()).discover(spec);

  assert.equal(requests[0].googleSearch, true);
  assert.equal(requests[0].jsonSchema, undefined);
  assert.equal(requests[1].googleSearch, undefined);
  assert.ok(requests[1].jsonSchema);
  assert.match(requests[1].prompt, /\["2 inputs"\]/);
  assert.deepEqual(products.map((p) => p.name), ["Good One", "Bad MRP"]);
  assert.equal(products[0].claimedOriginal, 14999);
  assert.equal(products[1].claimedOriginal, undefined); // MRP below price is ignored
  assert.deepEqual(products[0].mustHaveChecks, [{ requirement: "2 inputs", met: "yes", evidence: "2 combo inputs" }]);
  assert.deepEqual(products[1].mustHaveChecks, [{ requirement: "2 inputs", met: "unknown", evidence: "" }]); // invented check dropped
  assert.equal(products[0].linkInSources, true); // amazon.in is a grounding source
  assert.equal(products[1].linkInSources, false); // flipkart.com is not
});

test("Gemini errors surface from discover", async () => {
  const { gen } = fakeGenerator(new Error("429 RESOURCE_EXHAUSTED"));
  await assert.rejects(() => new GeminiSource({ generator: gen }, newStore()).discover(spec), /429/);
});

test("linkInSources matches subdomains and handles no sources", () => {
  assert.equal(linkInSources("https://www.amazon.in/x", sources), true);
  assert.equal(linkInSources("https://shop.example.com/x", [{ title: "example.com", uri: "u" }]), true);
  assert.equal(linkInSources("https://evil-amazon.in/x", sources), false);
  assert.equal(linkInSources("https://www.amazon.in/x", []), undefined);
});

test("must-haves: AI 'no' drops, 'unknown' keeps but flags, no checks falls back to text match", async () => {
  const base = { id: "p", name: "P", store: "S", url: "https://s.in", currentPrice: 9000, features: ["USB"] };
  assert.deepEqual(evaluateMustHaves({ ...base, mustHaveChecks: [{ requirement: "2 inputs", met: "no", evidence: "1 input" }] }, ["2 inputs"]),
    { missing: ["2 inputs"], unconfirmed: [] });
  assert.deepEqual(evaluateMustHaves({ ...base, mustHaveChecks: [{ requirement: "2 inputs", met: "unknown", evidence: "" }] }, ["2 inputs"]),
    { missing: [], unconfirmed: ["2 inputs"] });
  assert.deepEqual(evaluateMustHaves({ ...base, mustHaveChecks: [{ requirement: "2 inputs", met: "yes", evidence: "two XLR" }] }, ["2 inputs"]),
    { missing: [], unconfirmed: [] });
  assert.deepEqual(evaluateMustHaves(base, ["2 inputs"]), { missing: ["2 inputs"], unconfirmed: [] }); // seeded/mock path

  const { gen } = fakeGenerator(
    { text: "findings", sources },
    { text: JSON.stringify([
      { name: "Two", store: "Amazon.in", url: "https://amazon.in/a", currentPrice: 9000, features: ["two XLR combo jacks"],
        requirementChecks: [{ requirement: "2 inputs", met: "yes", evidence: "two XLR combo jacks" }] },
      { name: "One", store: "Amazon.in", url: "https://amazon.in/b", currentPrice: 5000, features: ["1 input"],
        requirementChecks: [{ requirement: "2 inputs", met: "no", evidence: "1 input" }] },
    ]), sources: [] },
  );
  const r = await scoutDetailed(spec, new GeminiSource({ generator: gen }, newStore()));
  assert.deepEqual(r.items.map((i) => i.product.name), ["Two"]); // substring rule alone would have dropped it
  assert.equal(r.filteredOut[0].reason, "Missing: 2 inputs");
});

test("buildWatchSpec: Gemini output is validated; failures fall back to the heuristic", async () => {
  const ok = fakeGenerator({ text: JSON.stringify({ category: "audio interface", budget: 20000, mustHaves: ["2 inputs"], niceToHaves: [],
    excluded: [], searchTerms: ["audio interface"], needsClarification: false }), sources: [] });
  const a = await buildWatchSpec("audio interface under 15k", ok.gen);
  assert.equal(a.via, "gemini");
  assert.equal(a.spec.budget, 15000); // user's stated budget wins
  assert.ok(ok.requests[0].jsonSchema);

  const bad = fakeGenerator(new Error("boom"));
  const b = await buildWatchSpec("audio interface under 15k", bad.gen);
  assert.equal(b.via, "heuristic");

  const none = await buildWatchSpec("audio interface under 15k", null);
  assert.equal(none.via, "heuristic");
});

test("createGenerator picks Vertex AI, API key, or nothing", () => {
  assert.equal(createGenerator(loadConfig({})), null);
  assert.equal(createGenerator(loadConfig({ GEMINI_API_KEY: "k" }))?.backend, "gemini-api");
  const v = createGenerator(loadConfig({ GOOGLE_GENAI_USE_VERTEXAI: "true", GOOGLE_CLOUD_PROJECT: "p", GEMINI_API_KEY: "k" }));
  assert.equal(v?.backend, "vertex-ai");
  assert.equal(v?.model, "gemini-3.8-flash");
  assert.throws(() => loadConfig({ GOOGLE_GENAI_USE_VERTEXAI: "true" }), /GOOGLE_CLOUD_PROJECT/);
});

test("stepModels: per-step models default to GEMINI_MODEL, env overrides win", () => {
  const def = stepModels(loadConfig({ GEMINI_MODEL: "base", GEMINI_SPEC_MODEL: "" }));
  assert.deepEqual(def, {
    spec: { model: "base", thinkingLevel: "low" },
    research: { model: "base", thinkingLevel: "medium" },
    validator: { model: "base", thinkingLevel: "low" },
    advisor: { model: "base", thinkingLevel: "low" },
  });
  const set = stepModels(loadConfig({ GEMINI_SPEC_MODEL: "s", GEMINI_RESEARCH_MODEL: "r", GEMINI_ADVISOR_MODEL: "a", GEMINI_VALIDATOR_MODEL: "v" }));
  assert.equal(set.spec.model, "s");
  assert.equal(set.research.model, "r");
  assert.equal(set.advisor.model, "a");
  assert.equal(set.validator.model, "v");
});

test("buildWatchSpec sends the spec step's model and thinking level", async () => {
  const { gen, requests } = fakeGenerator(new Error("boom"));
  await buildWatchSpec("audio interface under 15k", gen, { model: "spec-model", thinkingLevel: "low" });
  assert.equal(requests[0].model, "spec-model");
  assert.equal(requests[0].thinkingLevel, "low");
  assert.ok(requests[0].jsonSchema);
});

test("history store: today excluded, synthetic seeding only when empty", () => {
  const store = newStore();
  store.record("p", 100);
  assert.equal(store.get("p").length, 0);
  assert.equal(store.seedSynthetic("p", 100, 20), true);
  assert.equal(store.get("p").length, 20);
  assert.equal(store.seedSynthetic("p", 100, 20), false);
});

test("GenAIGenerator sends search/schema config to the SDK and reads text + grounding sources", async () => {
  const { GenAIGenerator } = await import("../src/ai/generator.ts");
  const calls: any[] = [];
  const fakeSdk = {
    models: {
      generateContent: async (params: any) => {
        calls.push(params);
        return {
          text: "hello",
          candidates: [{ groundingMetadata: { groundingChunks: [{ web: { uri: "https://g/1", title: "amazon.in" } }, { retrievedContext: {} }] } }],
        };
      },
    },
  };
  const g = new GenAIGenerator(fakeSdk as any, "gemini-3.8-flash", "gemini-api");
  const ctrl = new AbortController();
  const r = await g.generate({ prompt: "p", googleSearch: true, signal: ctrl.signal });
  assert.equal(r.text, "hello");
  assert.deepEqual(r.sources, [{ title: "amazon.in", uri: "https://g/1", domain: undefined }]);
  assert.equal(calls[0].model, "gemini-3.8-flash");
  assert.deepEqual(calls[0].config.tools, [{ googleSearch: {} }]);
  assert.equal(calls[0].config.abortSignal, ctrl.signal);
  assert.equal(calls[0].config.responseJsonSchema, undefined);

  await g.generate({ prompt: "p", jsonSchema: { type: "object" } });
  assert.equal(calls[1].config.responseMimeType, "application/json");
  assert.deepEqual(calls[1].config.responseJsonSchema, { type: "object" });
  assert.equal(calls[1].config.tools, undefined);

  const empty = new GenAIGenerator({ models: { generateContent: async () => ({ text: "" }) } } as any, "m", "gemini-api");
  await assert.rejects(() => empty.generate({ prompt: "p" }), /empty response/);
});

test("GenAIGenerator logs one line per call: step, duration, searches and tokens, or the failure", async () => {
  const { GenAIGenerator } = await import("../src/ai/generator.ts");
  const logs: string[] = [];
  const sdk = {
    models: {
      generateContent: async (params: any) => {
        if (params.contents === "fail") throw new Error("deadline exceeded");
        return {
          text: "{}",
          usageMetadata: { thoughtsTokenCount: 900, candidatesTokenCount: 300, promptTokenCount: 200, toolUsePromptTokenCount: 5000 },
          candidates: [{ groundingMetadata: { webSearchQueries: ["a", "b", "c"] } }],
        };
      },
    },
  };
  const g = new GenAIGenerator(sdk as any, "m", "vertex-ai", (l) => logs.push(l));
  await g.generate({ prompt: "secret prompt", label: "details: X", thinkingLevel: "medium" });
  assert.match(logs[0], /^gemini: details: X \[m, medium thinking\] \d+ms, 3 searches, tokens: 900 thinking, 300 output, 200 prompt, 5000 search results$/);
  assert.doesNotMatch(logs[0], /secret/);
  await assert.rejects(g.generate({ prompt: "fail" }), /deadline/);
  assert.match(logs[1], /^gemini: call \[m, default thinking\] failed after \d+ms: deadline exceeded$/);
});

// ---------- Hedged calls ----------

/** Fake generator: each call follows the next script step (answer or fail after ms), and honours abort. */
function scripted(steps: { ms: number; text?: string; fail?: string }[]) {
  const calls: GenerateRequest[] = [];
  const gen: TextGenerator = {
    model: "m",
    backend: "gemini-api",
    generate(req) {
      calls.push(req);
      const step = steps[calls.length - 1];
      return new Promise<GenerateResult>((resolve, reject) => {
        const t = setTimeout(() => (step.fail ? reject(new Error(step.fail)) : resolve({ text: step.text ?? "", sources: [] })), step.ms);
        req.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new Error("aborted"));
        });
      });
    },
  };
  return { gen, calls };
}

test("HedgedGenerator: a fast answer needs no backup call", async () => {
  const { HedgedGenerator } = await import("../src/ai/generator.ts");
  const { gen, calls } = scripted([{ ms: 5, text: "first" }]);
  const res = await new HedgedGenerator(gen, 50, () => {}).generate({ prompt: "p", thinkingLevel: "medium" });
  assert.equal(res.text, "first");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].thinkingLevel, "medium");
});

test("HedgedGenerator: a slow call gets a low-thinking backup; the first answer wins and the other is cancelled", async () => {
  const { HedgedGenerator } = await import("../src/ai/generator.ts");
  const { gen, calls } = scripted([{ ms: 1000, text: "slow" }, { ms: 5, text: "backup" }]);
  const logs: string[] = [];
  const res = await new HedgedGenerator(gen, 20, (l) => logs.push(l)).generate({ prompt: "p", thinkingLevel: "medium" });
  assert.equal(res.text, "backup");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].thinkingLevel, "low");
  assert.equal(calls[1].prompt, "p");
  assert.equal(calls[0].signal?.aborted, true);
  assert.match(logs.join("\n"), /backup call at low thinking.*no answer yet[\s\S]*backup answered/);
});

test("HedgedGenerator: an early failure starts the backup at once", async () => {
  const { HedgedGenerator } = await import("../src/ai/generator.ts");
  const { gen, calls } = scripted([{ ms: 1, fail: "429" }, { ms: 1, text: "backup" }]);
  const started = Date.now();
  const res = await new HedgedGenerator(gen, 5000, () => {}).generate({ prompt: "p" });
  assert.equal(res.text, "backup");
  assert.equal(calls.length, 2);
  assert.ok(Date.now() - started < 1000);
});

test("HedgedGenerator: both calls failing rejects with the first error; at most one backup", async () => {
  const { HedgedGenerator } = await import("../src/ai/generator.ts");
  const { gen, calls } = scripted([{ ms: 1, fail: "first" }, { ms: 1, fail: "second" }]);
  await assert.rejects(new HedgedGenerator(gen, 5000, () => {}).generate({ prompt: "p" }), /first/);
  assert.equal(calls.length, 2);
});

test("HedgedGenerator: the caller's timeout cancels everything and starts no backup", async () => {
  const { HedgedGenerator } = await import("../src/ai/generator.ts");
  const { gen, calls } = scripted([{ ms: 1000, text: "slow" }]);
  await assert.rejects(new HedgedGenerator(gen, 500, () => {}).generate({ prompt: "p", signal: AbortSignal.timeout(10) }), /aborted/);
  assert.equal(calls.length, 1);
});

test("HedgedGenerator: GEMINI_HEDGE_MS=0 passes calls straight through", async () => {
  const { HedgedGenerator } = await import("../src/ai/generator.ts");
  const { gen, calls } = scripted([{ ms: 1, fail: "boom" }]);
  await assert.rejects(new HedgedGenerator(gen, 0, () => {}).generate({ prompt: "p" }), /boom/);
  assert.equal(calls.length, 1);
  assert.equal(loadConfig({}).GEMINI_HEDGE_MS, 50_000);
  assert.equal(loadConfig({ GEMINI_HEDGE_MS: "0" }).GEMINI_HEDGE_MS, 0);
});
