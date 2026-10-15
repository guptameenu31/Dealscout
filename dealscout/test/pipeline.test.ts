import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GenerateRequest, GenerateResult, TextGenerator } from "../src/ai/generator.ts";
import { createApp, type AppDeps } from "../src/server/app.ts";
import { loadConfig } from "../src/config.ts";
import { ResultCache } from "../src/server/resultCache.ts";
import { SerperClient } from "../src/sources/serper.ts";
import { heuristicSpec } from "../src/spec.ts";

const fixture = readFileSync(new URL("./fixtures/serper-scarlett.json", import.meta.url), "utf8");
const spec = { ...heuristicSpec("2-input audio interface under 25k"), budget: 25_000, mustHaves: ["2 inputs"] };
const json = (v: unknown): GenerateResult => ({ text: JSON.stringify(v), sources: [] });

/** Fake Gemini that answers by kind of request: shortlist, per-model details, or validation. */
function fakeGemini(opts: { validator?: string | Error } = {}) {
  const requests: GenerateRequest[] = [];
  const gen: TextGenerator = {
    model: "fake",
    backend: "gemini-api",
    async generate(req): Promise<GenerateResult> {
      requests.push(req);
      if (/decide which .* models/.test(req.prompt)) {
        return json({ models: [{ name: "Focusrite Scarlett 2i2 4th Gen", stretch: false, why: "2 inputs" }, { name: "Audient iD14 MkII", stretch: true, why: "better pres" }] });
      }
      if (req.prompt.includes("Use Google Search to research the")) {
        const ok = req.prompt.includes("2i2");
        return json({
          whyFits: "fits", keySpecs: ["2 mic pres"], community: "liked", concerns: [],
          mustHaveChecks: [{ requirement: "2 inputs", result: ok ? "yes" : "no", evidence: ok ? "2 combo inputs" : "has 1 input" }],
        });
      }
      const v = opts.validator ?? JSON.stringify({
        verdicts: [
          { id: "focusrite-scarlett-2i2-4th-gen#1", match: "exact", reason: "" },
          { id: "focusrite-scarlett-2i2-4th-gen#2", match: "exact", reason: "" },
          { id: "focusrite-scarlett-2i2-4th-gen#4", match: "bundle", reason: "Studio" },
        ],
      });
      if (v instanceof Error) throw v;
      return { text: v, sources: [] };
    },
  };
  return { gen, requests };
}

/** Real SerperClient over a fake fetch: the 2i2 query gets the recorded fixture, anything else fails. */
function fakeSerper() {
  const queries: string[] = [];
  const fetch = (async (url: URL) => {
    const q = url.searchParams.get("q")!;
    queries.push(q);
    return q.includes("2i2") ? new Response(fixture, { headers: { "content-type": "application/json" } }) : new Response("", { status: 500 });
  }) as unknown as typeof globalThis.fetch;
  return { serper: new SerperClient({ apiKey: "k", fetch }), queries };
}

async function start(overrides: Partial<AppDeps> = {}, env: Record<string, string> = {}) {
  const config = loadConfig({ DATA_DIR: mkdtempSync(join(tmpdir(), "ds-pipe-")), RATE_LIMIT_PER_MIN: "0", WEB_DIST: "x", ...env });
  const app = createApp({ config, log: false, liveSource: null, cache: new ResultCache(), generator: null, serper: null, ...overrides });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (path: string, body: unknown) => {
    const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as any };
  };
  return { server, post };
}

test("research → (details ∥ offers → validate): real prices from Serper, AI only names models and accepts/rejects", async () => {
  const gemini = fakeGemini();
  const serper = fakeSerper();
  const s = await start({ generator: gemini.gen, serper: serper.serper }, { SERPER_TOP_K: "5" });
  try {
    const research = await s.post("/api/research", { spec });
    assert.equal(research.status, 200);
    assert.equal(research.body.cached, false);
    assert.equal(research.body.sources, undefined);
    const models = research.body.models;
    assert.deepEqual(models.map((m: any) => [m.id, m.stretch]), [["focusrite-scarlett-2i2-4th-gen", false], ["audient-id14-mkii", true]]);
    assert.equal((await s.post("/api/research", { spec })).body.cached, true);

    const refs = models.map((m: any) => ({ id: m.id, name: m.name }));
    const [details, offers] = await Promise.all([s.post("/api/research/details", { spec, models: refs }), s.post("/api/offers", { models: refs })]);

    assert.equal(details.status, 200);
    assert.deepEqual(details.body.details.map((d: any) => d.modelId), refs.map((m: any) => m.id));
    assert.deepEqual(details.body.filteredOut, [{ modelId: "audient-id14-mkii", name: "Audient iD14 MkII", reason: 'Does not meet "2 inputs": has 1 input' }]);
    const detailCalls = gemini.requests.filter((r) => r.prompt.includes("research the")).length;
    await s.post("/api/research/details", { spec, models: refs });
    assert.equal(gemini.requests.filter((r) => r.prompt.includes("research the")).length, detailCalls, "details cached");

    assert.equal(offers.status, 200);
    assert.deepEqual(serper.queries, ["Focusrite Scarlett 2i2 4th Gen", "Audient iD14 MkII"]);
    const [ok, failed] = offers.body.results;
    assert.equal(ok.candidates.length, 5);
    assert.match(failed.error, /HTTP 500/);

    const candidates = offers.body.results.flatMap((r: any) => r.candidates);
    const v = await s.post("/api/validate", { spec, models: models.map((m: any) => ({ id: m.id, name: m.name, stretch: m.stretch })), candidates });
    assert.equal(v.status, 200);
    assert.equal(v.body.items.length, 1);
    const item = v.body.items[0];
    assert.equal(item.modelId, "focusrite-scarlett-2i2-4th-gen");
    assert.deepEqual(item.offers.map((o: any) => [o.store, o.price]), [["Found Sound", 21072.15], ["vmt.in", 24600]]);
    assert.equal(item.withinBudget, true);
    assert.deepEqual(v.body.filteredOut.map((f: any) => f.modelId), ["audient-id14-mkii"]);
    assert.equal(v.body.advice, null);
  } finally {
    s.server.close();
  }
});

test("validate: AI failure is a retryable 502; tampered or foreign candidates are rejected with 400", async () => {
  const model = { id: "m-1", name: "M 1", stretch: false };
  const cand = {
    id: "m-1#1", modelId: "m-1", title: "M 1", store: "S", pricePaise: 100_00, link: "https://www.google.com/x",
    linkType: "shopping", googleProductId: null, imageUrl: null, observedAt: "2026-10-15T10:00:00.000Z",
  };
  const s = await start({ generator: fakeGemini({ validator: new Error("Gemini 429: quota") }).gen });
  try {
    const fail = await s.post("/api/validate", { spec, models: [model], candidates: [cand] });
    assert.equal(fail.status, 502);
    assert.equal(fail.body.error.code, "UPSTREAM_ERROR");
    assert.match(fail.body.error.message, /429/);

    assert.equal((await s.post("/api/validate", { spec, models: [model], candidates: [{ ...cand, id: "x#1", modelId: "x" }] })).status, 400);
    assert.equal((await s.post("/api/validate", { spec, models: [model], candidates: [{ ...cand, link: "javascript:alert(1)" }] })).status, 400);
    assert.equal((await s.post("/api/validate", { spec, models: [model], candidates: [{ ...cand, pricePaise: 12.5 }] })).status, 400);
  } finally {
    s.server.close();
  }
});

test("pipeline endpoints answer 501 when AI or Serper is not configured; Gemini errors are 502", async () => {
  const off = await start();
  try {
    assert.equal((await off.post("/api/research", { spec })).status, 501);
    assert.equal((await off.post("/api/research/details", { spec, models: [{ id: "a", name: "A" }] })).status, 501);
    assert.equal((await off.post("/api/offers", { models: [{ id: "a", name: "A" }] })).status, 501);
    const v = await off.post("/api/validate", { spec, models: [{ id: "a", name: "A" }], candidates: [] });
    assert.equal(v.status, 501);
    assert.equal(v.body.error.code, "NOT_IMPLEMENTED");
  } finally {
    off.server.close();
  }

  const broken: TextGenerator = { model: "f", backend: "gemini-api", generate: async () => ({ text: "{oops", sources: [] }) };
  const s = await start({ generator: broken });
  try {
    const r = await s.post("/api/research", { spec });
    assert.equal(r.status, 502);
    assert.match(r.body.error.message, /Research failed/);
    const d = await s.post("/api/research/details", { spec, models: [{ id: "a", name: "A" }] });
    assert.equal(d.status, 502);
    assert.match(d.body.error.message, /Details failed/);
  } finally {
    s.server.close();
  }
});

test("offers and details: every lookup failing is a 502; more than 7 models is a 400", async () => {
  const s = await start({ serper: fakeSerper().serper, generator: fakeGemini().gen });
  try {
    assert.equal((await s.post("/api/offers", { models: [{ id: "a", name: "A" }] })).status, 502);
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, name: `M${i}` }));
    assert.equal((await s.post("/api/offers", { models: many })).status, 400);
    assert.equal((await s.post("/api/research/details", { spec, models: many })).status, 400);
  } finally {
    s.server.close();
  }
});
