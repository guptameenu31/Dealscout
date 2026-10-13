import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

process.env.DEALSCOUT_DATA_DIR = mkdtempSync(join(tmpdir(), "ds-api-"));
delete process.env.GEMINI_API_KEY;
const { createApp } = await import("../src/app.ts");

let server: Server;
let base = "";
before(async () => {
  server = createApp();
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const call = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as any };
};

const spec = {
  query: "audio interface with phantom power under 15k", category: "audio interface", budget: 15000, currency: "INR",
  mustHaves: ["48V phantom power"], niceToHaves: [], excluded: [], searchTerms: ["audio interface"],
  needsClarification: false, clarificationQuestion: null,
};

test("healthz", async () => {
  const r = await call("GET", "/healthz");
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
});

test("spec: validates length, returns contract fields, asks for a missing budget", async () => {
  const short = await call("POST", "/api/spec", { request: "hi" });
  assert.equal(short.status, 400);
  assert.equal(short.json.error.code, "VALIDATION_ERROR");

  const ok = await call("POST", "/api/spec", { request: "2-input USB audio interface with phantom power, no usb-c, under ₹15k" });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.via, "heuristic");
  assert.equal(ok.json.spec.currency, "INR");
  assert.equal(ok.json.spec.budget, 15000);
  assert.equal(ok.json.spec.needsClarification, false);
  assert.deepEqual(ok.json.spec.excluded, ["usb-c"]);

  const vague = await call("POST", "/api/spec", { request: "something for recording" });
  assert.equal(vague.json.spec.needsClarification, true);
  assert.ok(vague.json.spec.clarificationQuestion);
});

test("scout (auto, no key) falls back to seeded and matches the contract", async () => {
  const r = await call("POST", "/api/scout", { spec });
  assert.equal(r.status, 200);
  const d = r.json;
  assert.equal(d.provenance, "seeded");
  assert.equal(d.cachedAt, null);
  assert.ok(d.runId && d.generatedAt);
  const order = d.items.map((i: any) => i.verdict.label);
  assert.deepEqual(order, [...order].sort((a: string, b: string) => ({ buy_now: 0, wait: 1, skip: 2 } as any)[a] - ({ buy_now: 0, wait: 1, skip: 2 } as any)[b]));
  const scarlett = d.items.find((i: any) => i.product.name.startsWith("Focusrite"));
  assert.equal(scarlett.verdict.fakeDiscount, true);
  assert.equal(scarlett.product.claimedOriginal, 17999);
  assert.equal(scarlett.stats.count, 60);
  assert.equal(scarlett.stats.seededCount, 60);
  assert.equal(scarlett.history[0].provenance, "seeded");
  assert.match(scarlett.dataNotes[0], /synthetic/);
  const tascam = d.items.find((i: any) => i.product.name.startsWith("Tascam"));
  assert.equal(tascam.product.claimedOriginal, null);
  assert.equal(tascam.verdict.confidence, "low");
  assert.ok(d.filteredOut.some((f: any) => f.name === "Behringer UM2" && /phantom/.test(f.reason)));
});

test("scout: excluded features, bad input, live without a key", async () => {
  const ex = await call("POST", "/api/scout", { spec: { ...spec, mustHaves: [], excluded: ["USB-C"] } });
  assert.ok(ex.json.filteredOut.some((f: any) => /excluded/i.test(f.reason)));

  const bad = await call("POST", "/api/scout", { spec: { ...spec, budget: -5 } });
  assert.equal(bad.status, 400);

  const live = await call("POST", "/api/scout", { spec, mode: "live" });
  assert.equal(live.status, 502);
  assert.equal(live.json.error.code, "UPSTREAM_ERROR");
});

test("scout: other categories have seeded data too", async () => {
  const r = await call("POST", "/api/scout", { spec: { ...spec, category: "digital piano", budget: 40000, mustHaves: [] } });
  assert.ok(r.json.items.length >= 2);
});

test("digest: preview works, send is 501", async () => {
  const p = await call("POST", "/api/digest/preview", { spec });
  assert.equal(p.status, 200);
  assert.match(p.json.subject, /DealScout/);
  assert.match(p.json.html, /<html/);
  const s = await call("POST", "/api/digest/send", { spec, email: "a@b.com" });
  assert.equal(s.status, 501);
  assert.equal(s.json.error.code, "NOT_IMPLEMENTED");
  const badEmail = await call("POST", "/api/digest/send", { spec, email: "nope" });
  assert.equal(badEmail.status, 400);
});

test("watches: create, list, check, delete", async () => {
  const empty = await call("GET", "/api/watches");
  assert.deepEqual(empty.json.watches, []);
  const created = await call("POST", "/api/watches", { spec, email: "me@example.com" });
  assert.equal(created.status, 200);
  const id = created.json.id;
  assert.equal(created.json.lastResult, null);
  assert.equal((await call("GET", "/api/watches")).json.watches.length, 1);
  const checked = await call("POST", `/api/watches/${id}/check`);
  assert.ok(checked.json.lastCheckedAt);
  assert.ok(checked.json.lastResult.items.length > 0);
  assert.equal((await call("GET", `/api/watches/${id}`)).json.id, id);
  assert.deepEqual((await call("DELETE", `/api/watches/${id}`)).json, { deleted: true });
  assert.equal((await call("GET", `/api/watches/${id}`)).status, 404);
});

test("legacy streaming scout still works at the same path", async () => {
  const res = await fetch(base + "/api/scout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "audio interface under 15k" }) });
  const text = await res.text();
  assert.match(text, /"event":"result"/);
});

test("auto mode: live success is cached, then a live failure serves the cache; a cold failure serves seeded with a reason", async () => {
  const realFetch = globalThis.fetch;
  let geminiMode: "ok" | "fail" = "ok";
  let calls = 0;
  const reply = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
  globalThis.fetch = (async (input: any, init: any) => {
    const url = String(input);
    if (!url.includes("generativelanguage.googleapis.com")) return realFetch(input, init);
    if (geminiMode === "fail") return new Response("quota", { status: 429 });
    calls++;
    return calls % 2 === 1
      ? reply("findings")
      : reply(JSON.stringify([{ name: "Live Interface X", store: "Amazon.in", url: "https://a.in/x", currentPrice: 9000, claimedOriginal: 15000, features: ["2 inputs", "48V phantom power"] }]));
  }) as typeof fetch;
  process.env.GEMINI_API_KEY = "test-key";
  try {
    const liveSpec = { ...spec, category: "audio interface", mustHaves: ["48V phantom power"] };
    const live = await call("POST", "/api/scout", { spec: liveSpec });
    assert.equal(live.json.provenance, "live");
    assert.equal(live.json.items[0].product.name, "Live Interface X");
    assert.ok(live.json.items[0].history.every((h: any) => h.provenance === "seeded"), "new live product gets labelled synthetic history");

    geminiMode = "fail";
    const cached = await call("POST", "/api/scout", { spec: liveSpec });
    assert.equal(cached.json.provenance, "cached");
    assert.equal(cached.json.cachedAt, live.json.generatedAt);
    assert.match(cached.json.fallbackReason, /429/);

    const cold = await call("POST", "/api/scout", { spec: { ...liveSpec, budget: 14000 } });
    assert.equal(cold.json.provenance, "seeded");
    assert.match(cold.json.fallbackReason, /429/);

    const liveOnly = await call("POST", "/api/scout", { spec: liveSpec, mode: "live" });
    assert.equal(liveOnly.status, 502);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GEMINI_API_KEY;
  }
});
