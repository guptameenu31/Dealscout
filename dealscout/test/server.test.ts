import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, type AppDeps } from "../src/server/app.ts";
import { loadConfig } from "../src/config.ts";
import { ResultCache } from "../src/server/resultCache.ts";
import { MockSource } from "../src/sources/mock.ts";
import { heuristicSpec } from "../src/spec.ts";
import type { PriceSource } from "../src/types.ts";

/** Start an app on a random port with test config; returns a JSON-posting helper. */
async function start(overrides: Partial<AppDeps> = {}) {
  const config = loadConfig({
    DATA_DIR: mkdtempSync(join(tmpdir(), "ds-srv-")),
    RATE_LIMIT_PER_MIN: "0",
    WEB_DIST: "does-not-exist",
  });
  const app = createApp({
    config,
    log: false,
    liveSource: null,
    cache: new ResultCache(),
    buildSpec: async (q) => ({ spec: heuristicSpec(q), via: "heuristic", warnings: [] }),
    ...overrides,
  });
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, body?: unknown, raw?: string) => {
    const res = await fetch(base + path, {
      method,
      headers: { "content-type": "application/json" },
      body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    return { status: res.status, body: (await res.json()) as any };
  };
  return { server, call };
}

const spec = heuristicSpec("2-input audio interface with phantom power under 15k");

/** A live source that works like MockSource but reports itself as live (no seeded history). */
const fakeLive = (): PriceSource => {
  const mock = new MockSource();
  return {
    name: "fake-live",
    discover: (s) => mock.discover(s),
    history: async (p) => (await mock.history(p)).map((h) => ({ ...h, provenance: "live" as const })),
  };
};
const failingLive = (): PriceSource => ({
  name: "failing",
  discover: async () => {
    throw new Error("Gemini 429: quota");
  },
  history: async () => [],
});

let shared: Awaited<ReturnType<typeof start>>;
before(async () => {
  shared = await start();
});
after(() => shared.server.close());

test("GET /healthz and /api/health", async () => {
  const r = await shared.call("GET", "/healthz");
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  const api = await shared.call("GET", "/api/health");
  assert.equal(api.status, 200);
  assert.equal(api.body.ok, true);
});

test("POST /api/spec returns a spec", async () => {
  const r = await shared.call("POST", "/api/spec", { request: "2-input audio interface under ₹15,000" });
  assert.equal(r.status, 200);
  assert.equal(r.body.via, "heuristic");
  assert.equal(r.body.spec.budget, 15000);
  assert.equal(r.body.spec.currency, "INR");
  assert.deepEqual(r.body.warnings, []);
});

test("POST /api/spec rejects bad input with VALIDATION_ERROR", async () => {
  const short = await shared.call("POST", "/api/spec", { request: "hi" });
  assert.equal(short.status, 400);
  assert.equal(short.body.error.code, "VALIDATION_ERROR");
  const badJson = await shared.call("POST", "/api/spec", undefined, "{not json");
  assert.equal(badJson.status, 400);
  assert.equal(badJson.body.error.code, "VALIDATION_ERROR");
});

test("POST /api/scout seeded: contract shape, provenance labels, stats", async () => {
  const r = await shared.call("POST", "/api/scout", { spec, mode: "seeded" });
  assert.equal(r.status, 200);
  assert.equal(r.body.provenance, "seeded");
  assert.equal(r.body.fallbackReason, null);
  assert.equal(r.body.items[0].verdict.label, "buy_now");
  assert.equal(r.body.items.at(-1).verdict.label, "skip");
  const tascam = r.body.items.find((i: any) => i.product.id === "tascam-us2x2hr");
  assert.equal(tascam.product.claimedOriginal, null);
  assert.equal(tascam.stats.count, 6);
  assert.ok(tascam.history.every((h: any) => h.provenance === "seeded"));
  assert.ok(tascam.dataNotes.some((n: string) => n.includes("synthetic")));
  assert.ok(r.body.items.every((i: any) => typeof i.product.observedAt === "string"));
});

test("POST /api/scout rejects an invalid spec", async () => {
  const r = await shared.call("POST", "/api/scout", { spec: { ...spec, budget: -5 } });
  assert.equal(r.status, 400);
  assert.equal(r.body.error.code, "VALIDATION_ERROR");
});

test("scout reports products filtered out by must-haves", async () => {
  const r = await shared.call("POST", "/api/scout", { spec: { ...spec, mustHaves: ["4 inputs"] }, mode: "seeded" });
  assert.equal(r.body.items.length, 0);
  assert.equal(r.body.filteredOut.length, 7);
  assert.match(r.body.filteredOut[0].reason, /Missing: 4 inputs/);
});

test("auto mode without live search falls back to seeded, with a reason", async () => {
  const r = await shared.call("POST", "/api/scout", { spec });
  assert.equal(r.body.provenance, "seeded");
  assert.match(r.body.fallbackReason, /not configured/);
});

test("auto: live success is cached, then a live failure serves the cache", async () => {
  let fail = false;
  const s = await start({ liveSource: () => (fail ? failingLive() : fakeLive()) });
  try {
    const first = await s.call("POST", "/api/scout", { spec });
    assert.equal(first.body.provenance, "live");
    fail = true;
    const second = await s.call("POST", "/api/scout", { spec });
    assert.equal(second.body.provenance, "cached");
    assert.equal(second.body.cachedAt, first.body.generatedAt);
    assert.match(second.body.fallbackReason, /Gemini 429/);
  } finally {
    s.server.close();
  }
});

test("auto: live failure with no cache falls back to seeded", async () => {
  const s = await start({ liveSource: failingLive });
  try {
    const r = await s.call("POST", "/api/scout", { spec });
    assert.equal(r.body.provenance, "seeded");
    assert.match(r.body.fallbackReason, /Live search failed/);
  } finally {
    s.server.close();
  }
});

test("live mode surfaces failures as UPSTREAM_ERROR", async () => {
  const s = await start({ liveSource: failingLive });
  try {
    const r = await s.call("POST", "/api/scout", { spec, mode: "live" });
    assert.equal(r.status, 502);
    assert.equal(r.body.error.code, "UPSTREAM_ERROR");
  } finally {
    s.server.close();
  }
});

test("live search that hangs times out and falls back", async () => {
  const hanging = (signal: AbortSignal): PriceSource => ({
    name: "hanging",
    discover: () => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
    history: async () => [],
  });
  const config = { LIVE_TIMEOUT_MS: "50" };
  const s = await start({ liveSource: hanging, config: loadConfig({ ...config, RATE_LIMIT_PER_MIN: "0", DATA_DIR: mkdtempSync(join(tmpdir(), "ds-t-")) }) });
  try {
    const r = await s.call("POST", "/api/scout", { spec });
    assert.equal(r.body.provenance, "seeded");
    assert.match(r.body.fallbackReason, /timed out/);
  } finally {
    s.server.close();
  }
});

test("POST /api/digest/preview returns subject and disclosed demo HTML", async () => {
  const r = await shared.call("POST", "/api/digest/preview", { spec, mode: "seeded" });
  assert.equal(r.status, 200);
  assert.match(r.body.subject, /DealScout: 2 to buy now/);
  assert.match(r.body.html, /synthetic/);
});

test("not-yet-built endpoints answer 501, unknown API routes 404", async () => {
  assert.equal((await shared.call("POST", "/api/digest/send", { spec, email: "a@b.c" })).status, 501);
  const w = await shared.call("GET", "/api/watches");
  assert.equal(w.status, 501);
  assert.equal(w.body.error.code, "NOT_IMPLEMENTED");
  const nf = await shared.call("GET", "/api/nope");
  assert.equal(nf.status, 404);
  assert.equal(nf.body.error.code, "NOT_FOUND");
});

test("rate limit answers 429 RATE_LIMITED", async () => {
  const s = await start({ config: loadConfig({ RATE_LIMIT_PER_MIN: "2", DATA_DIR: mkdtempSync(join(tmpdir(), "ds-r-")) }) });
  try {
    for (let i = 0; i < 2; i++) assert.equal((await s.call("POST", "/api/spec", { request: "audio interface" })).status, 200);
    const r = await s.call("POST", "/api/spec", { request: "audio interface" });
    assert.equal(r.status, 429);
    assert.equal(r.body.error.code, "RATE_LIMITED");
  } finally {
    s.server.close();
  }
});
