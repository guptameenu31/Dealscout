import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseInrPaise, pickOffers, searchLink, SerperClient, toCandidates, type Candidate, type SerperShoppingItem,
} from "../src/sources/serper.ts";

// Real Serper /shopping response for "Focusrite Scarlett 2i2 4th Gen" (gl=in), recorded Oct 15, 2026.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/serper-scarlett.json", import.meta.url), "utf8")) as {
  shopping: SerperShoppingItem[];
};
const NOW = "2026-10-15T10:00:00.000Z";

test("parseInrPaise: ₹ only, to integer paise", () => {
  assert.equal(parseInrPaise("₹23,049"), 2304900);
  assert.equal(parseInrPaise("₹34,506.83"), 3450683);
  assert.equal(parseInrPaise("₹1,23,456.5"), 12345650);
  assert.equal(parseInrPaise("₹999"), 99900);
  for (const bad of ["$230.49", "Rs. 23,049", "23049", "₹", "₹abc", "₹0", "", undefined]) assert.equal(parseInrPaise(bad), null, String(bad));
});

test("toCandidates: first k usable listings in Serper's order, prices in paise, IDs per model", () => {
  const c = toCandidates("scarlett-2i2", fixture.shopping, 5, NOW);
  assert.equal(c.length, 5);
  assert.deepEqual(c.map((x) => x.id), ["scarlett-2i2#1", "scarlett-2i2#2", "scarlett-2i2#3", "scarlett-2i2#4", "scarlett-2i2#5"]);
  assert.deepEqual(c.map((x) => x.title), fixture.shopping.slice(0, 5).map((x) => x.title));
  assert.equal(c[0].pricePaise, 2107215);
  assert.equal(c[0].store, "Found Sound");
  assert.equal(c[0].linkType, "shopping");
  assert.equal(c[0].googleProductId, "9410598977096791099");
  assert.ok(c[0].imageUrl?.startsWith("https://"));
  assert.equal(c[0].observedAt, NOW);
  assert.equal(toCandidates("m", fixture.shopping, 50, NOW).length, fixture.shopping.length);
});

test("toCandidates: skips listings without store or ₹ price; builds a search link when none", () => {
  const items: SerperShoppingItem[] = [
    { title: "No store", price: "₹100" },
    { title: "Dollars", price: "$5", source: "S" },
    { title: "", price: "₹100", source: "S" },
    { title: "No link", price: "₹1,000", source: "S", productId: "" },
    { title: "Good", price: "₹2,000", source: "T", link: "https://www.google.com/x", productId: "9" },
  ];
  const c = toCandidates("m", items, 5, NOW);
  assert.deepEqual(c.map((x) => [x.id, x.title]), [["m#1", "No link"], ["m#2", "Good"]]);
  assert.equal(c[0].link, searchLink("No link"));
  assert.equal(c[0].linkType, "search");
  assert.equal(c[0].googleProductId, null);
  assert.equal(c[1].linkType, "shopping");
});

test("pickOffers: cheapest per store, cheapest first, max 4", () => {
  const mk = (store: string, rupees: number): Candidate => ({
    id: `m#${store}${rupees}`, modelId: "m", title: "t", store, pricePaise: rupees * 100, link: "https://x", linkType: "shopping",
    googleProductId: null, imageUrl: null, observedAt: NOW,
  });
  const out = pickOffers([mk("A", 300), mk("a", 200), mk("B", 100), mk("C", 400), mk("D", 500), mk("E", 600)]);
  assert.deepEqual(out.map((o) => [o.store, o.pricePaise]), [["B", 10000], ["a", 20000], ["C", 40000], ["D", 50000]]);
});

/** Fake fetch: records the call and returns the given response. */
function fakeFetch(respond: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const fetch = (async (url: URL, init: RequestInit) => {
    calls.push({ url, init });
    return respond(url, init);
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

test("SerperClient: India shopping query with key header", async () => {
  const { fetch, calls } = fakeFetch(() => Response.json(fixture));
  const items = await new SerperClient({ apiKey: "secret-key", fetch }).shopping("Focusrite Scarlett 2i2 4th Gen");
  assert.equal(items.length, fixture.shopping.length);
  const { url, init } = calls[0];
  assert.equal(url.origin + url.pathname, "https://google.serper.dev/shopping");
  assert.equal(url.searchParams.get("q"), "Focusrite Scarlett 2i2 4th Gen");
  assert.equal(url.searchParams.get("gl"), "in");
  assert.equal(url.searchParams.get("hl"), "en");
  assert.equal((init.headers as Record<string, string>)["X-API-KEY"], "secret-key");
});

test("SerperClient: HTTP error and bad JSON throw without leaking the key; abort rejects", async () => {
  const http = new SerperClient({ apiKey: "secret-key", fetch: fakeFetch(() => new Response("nope", { status: 403 })).fetch });
  await assert.rejects(http.shopping("x"), (e: Error) => /HTTP 403/.test(e.message) && !e.message.includes("secret-key"));

  const junk = new SerperClient({ apiKey: "secret-key", fetch: fakeFetch(() => new Response("<html>")).fetch });
  await assert.rejects(junk.shopping("x"), /invalid JSON/);

  const empty = new SerperClient({ apiKey: "k", fetch: fakeFetch(() => Response.json({})).fetch });
  assert.deepEqual(await empty.shopping("x"), []);

  // Waits until its signal aborts, like a hung request.
  const hang = fakeFetch((_url, init) => new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason))));
  await assert.rejects(new SerperClient({ apiKey: "k", fetch: hang.fetch, timeoutMs: 20 }).shopping("x"));
  const ctrl = new AbortController();
  const p = new SerperClient({ apiKey: "k", fetch: hang.fetch }).shopping("x", ctrl.signal);
  ctrl.abort();
  await assert.rejects(p);
});
