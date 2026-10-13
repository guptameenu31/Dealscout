import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GeminiSource } from "../src/sources/gemini.ts";
import { HistoryStore } from "../src/historyStore.ts";
import { heuristicSpec } from "../src/spec.ts";

const reply = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
const newStore = () => new HistoryStore(join(mkdtempSync(join(tmpdir(), "ds-")), "h.json"));

test("discover: grounded call, then structured extraction; junk rows dropped", async () => {
  const bodies: any[] = [];
  const fetchImpl = (async (_u: string, init: any) => {
    bodies.push(JSON.parse(init.body));
    return bodies.length === 1
      ? reply("Some search findings")
      : reply(
          JSON.stringify([
            { name: "Good One", store: "Amazon.in", url: "https://a.in/1", currentPrice: 9999, claimedOriginal: 14999, features: ["2 inputs"] },
            { name: "Good One", store: "Amazon.in", url: "https://a.in/1", currentPrice: 9999, features: [] }, // duplicate
            { name: "No Url", store: "X", url: "unknown", currentPrice: 5000, features: [] },
            { name: "No Price", store: "X", url: "https://x.in", currentPrice: 0, features: [] },
            { name: "Bad MRP", store: "Flipkart", url: "https://f.in/2", currentPrice: 8000, claimedOriginal: 7000, features: [] },
          ]),
        );
  }) as any;

  const store = newStore();
  const src = new GeminiSource({ apiKey: "k", fetchImpl }, store);
  const products = await src.discover(heuristicSpec("audio interface under 15k"));

  assert.deepEqual(bodies[0].tools, [{ google_search: {} }]);
  assert.equal(bodies[0].generationConfig, undefined);
  assert.equal(bodies[1].generationConfig.responseMimeType, "application/json");
  assert.equal(bodies[1].tools, undefined);
  assert.deepEqual(products.map((p) => p.name), ["Good One", "Bad MRP"]);
  assert.equal(products[0].claimedOriginal, 14999);
  assert.equal(products[1].claimedOriginal, undefined); // MRP below price is ignored
});

test("API errors surface with status", async () => {
  const fetchImpl = (async () => new Response("quota", { status: 429 })) as any;
  const src = new GeminiSource({ apiKey: "k", fetchImpl }, newStore());
  await assert.rejects(() => src.discover(heuristicSpec("x under 1k")), /Gemini 429/);
});

test("history store: today excluded, synthetic seeding only when empty", () => {
  const store = newStore();
  store.record("p", 100);
  assert.equal(store.get("p").length, 0);
  assert.equal(store.seedSynthetic("p", 100, 20), true);
  assert.equal(store.get("p").length, 20);
  assert.equal(store.seedSynthetic("p", 100, 20), false);
});
