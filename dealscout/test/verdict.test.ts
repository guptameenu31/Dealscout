import { test } from "node:test";
import assert from "node:assert/strict";
import { judge } from "../src/verdict.ts";
import { parseBudget, heuristicSpec } from "../src/spec.ts";
import { scout } from "../src/scout.ts";
import { MockSource } from "../src/sources/mock.ts";
import type { PricePoint, Product, WatchSpec } from "../src/types.ts";

const spec: WatchSpec = { query: "", category: "x", budget: 15000, mustHaves: [], niceToHaves: [], searchTerms: [] };
const hist = (prices: number[]): PricePoint[] => prices.map((price, i) => ({ date: `d${i}`, price }));
const prod = (currentPrice: number, claimedOriginal?: number): Product => ({
  id: "p", name: "P", store: "S", url: "u", currentPrice, claimedOriginal, features: [],
});
const flat = (n: number, price: number) => Array(n).fill(price);

test("over budget is skipped", () => {
  assert.equal(judge(prod(20000), hist(flat(30, 20000)), spec).label, "skip");
});

test("short history waits with low confidence", () => {
  const v = judge(prod(9000), hist(flat(5, 10000)), spec);
  assert.equal(v.label, "wait");
  assert.equal(v.confidence, "low");
});

test("inflated was-price is flagged as fake", () => {
  const v = judge(prod(8500, 13000), hist(flat(40, 8500)), spec);
  assert.equal(v.fakeDiscount, true);
  assert.equal(v.label, "wait");
});

test("was-price that really held is not fake", () => {
  const v = judge(prod(9500, 13000), hist([...flat(10, 13000), ...flat(30, 11000)]), spec);
  assert.equal(v.fakeDiscount, false);
  assert.equal(v.label, "buy_now");
});

test("new low is buy now", () => {
  const v = judge(prod(9000), hist([...flat(20, 10000), ...flat(20, 10500)]), spec);
  assert.equal(v.label, "buy_now");
  assert.equal(v.isLowestSeen, true);
});

test("falling price above the low waits", () => {
  const prices = [...flat(10, 8200), ...flat(15, 9900), ...flat(7, 9900), ...flat(7, 9400)];
  assert.equal(judge(prod(9200), hist(prices), spec).label, "wait");
});

test("budget parsing", () => {
  assert.equal(parseBudget("under ₹15k"), 15000);
  assert.equal(parseBudget("below Rs. 15,000"), 15000);
  assert.equal(parseBudget("no number here"), undefined);
});

test("heuristic picks up 2-input and phantom power", () => {
  const s = heuristicSpec("2-input audio interface with phantom power under 15k");
  assert.deepEqual(s.mustHaves, ["48V phantom power", "2 inputs"]);
});

test("scout ranks buy_now first and covers every scenario", async () => {
  const items = await scout(heuristicSpec("audio interface under 15k"), new MockSource());
  assert.equal(items[0].verdict.label, "buy_now");
  assert.equal(items.at(-1)!.verdict.label, "skip");
  assert.ok(items.some((i) => i.verdict.fakeDiscount));
});
