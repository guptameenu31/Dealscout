import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { GenerateRequest, TextGenerator } from "../src/ai/generator.ts";
import { applyVerdicts, judgeListings, NO_MATCH_REASON, OUTLIER_REASON, type PricedModel, type Verdict } from "../src/ai/validator.ts";
import { dropPriceOutliers, toCandidates, type Candidate, type SerperShoppingItem } from "../src/sources/serper.ts";
import { heuristicSpec } from "../src/spec.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/serper-scarlett.json", import.meta.url), "utf8")) as {
  shopping: SerperShoppingItem[];
};
const NOW = "2026-10-15T10:00:00.000Z";
const step = { model: "validator-model", thinkingLevel: "low" as const };
const spec = { ...heuristicSpec("2-input audio interface under 25k"), budget: 25_000 };

const researched = (id: string, name: string, stretch = false): PricedModel => ({ id, name, stretch });
const m2i2 = researched("scarlett-2i2", "Focusrite Scarlett 2i2 4th Gen");
const mOther = researched("other", "Other Interface");
// Fixture top 8: #1 2i2 ₹21,072 · #2 2i2 ₹24,600 · #3 2i2 ₹25,750 · #4/#5 Studio bundles · #6 Solo · #7 2i2 ₹24,700 · #8 2i2 Anniversary ₹25,997
const candidates = toCandidates("scarlett-2i2", fixture.shopping, 8, NOW);

function fakeGenerator(text: string | Error) {
  const requests: GenerateRequest[] = [];
  const gen: TextGenerator = {
    model: "fake",
    backend: "gemini-api",
    async generate(req) {
      requests.push(req);
      if (text instanceof Error) throw text;
      return { text, sources: [] };
    },
  };
  return { gen, requests };
}

test("judgeListings: one prompt with every listing ID, validator step, JSON schema; junk verdicts dropped", async () => {
  const { gen, requests } = fakeGenerator(
    JSON.stringify({
      verdicts: [
        { id: "scarlett-2i2#1", match: "exact", reason: "Same model at ₹21,072" },
        { id: "scarlett-2i2#4", match: "bundle", reason: "Studio pack" },
        { id: "scarlett-2i2#6", match: "maybe", reason: "?" },
        { match: "exact" },
      ],
    }),
  );
  const v = await judgeListings(spec, [m2i2], candidates, gen, step);
  const prompt = requests[0].prompt;
  for (const c of candidates) assert.ok(prompt.includes(c.id), c.id);
  assert.equal(requests[0].model, "validator-model");
  assert.match(prompt, /^Today is /);
  assert.equal(requests[0].thinkingLevel, "low");
  assert.ok(requests[0].jsonSchema);
  assert.deepEqual(v, [
    { id: "scarlett-2i2#1", match: "exact", reason: "Same model at" },
    { id: "scarlett-2i2#4", match: "bundle", reason: "Studio pack" },
  ]);
});

test("judgeListings: errors and invalid JSON throw; no candidates means no call", async () => {
  await assert.rejects(judgeListings(spec, [m2i2], candidates, fakeGenerator(new Error("429")).gen, step), /429/);
  await assert.rejects(judgeListings(spec, [m2i2], candidates, fakeGenerator("{bad").gen, step), /invalid JSON/);
  await assert.rejects(judgeListings(spec, [m2i2], candidates, fakeGenerator("{}").gen, step), /no verdicts/);
  const none = fakeGenerator("{}");
  assert.deepEqual(await judgeListings(spec, [m2i2], [], none.gen, step), []);
  assert.equal(none.requests.length, 0);
});

test("applyVerdicts: only exact listings priced; code computes cheapest and budget; fail closed", () => {
  const verdicts: Verdict[] = [
    { id: "scarlett-2i2#1", match: "exact", reason: "" },
    { id: "scarlett-2i2#2", match: "exact", reason: "" },
    { id: "scarlett-2i2#4", match: "bundle", reason: "Studio pack" },
    { id: "scarlett-2i2#6", match: "different_model", reason: "Solo" },
    { id: "scarlett-2i2#7", match: "exact", reason: "" },
    { id: "scarlett-2i2#1", match: "accessory", reason: "duplicate verdict ignored" },
    { id: "made-up#1", match: "exact", reason: "unknown ID ignored" },
  ];
  const r = applyVerdicts(spec, [m2i2, mOther], candidates, verdicts);
  assert.equal(r.items.length, 1);
  const item = r.items[0];
  assert.equal(item.modelId, "scarlett-2i2");
  assert.equal(item.name, "Focusrite Scarlett 2i2 4th Gen");
  assert.equal(item.stretch, false);
  assert.deepEqual(item.offers.map((o) => [o.store, o.price]), [["Found Sound", 21072.15], ["vmt.in", 24600], ["vplak.com", 24700]]);
  assert.equal(item.currentPrice, 21072.15);
  assert.equal(item.withinBudget, true);
  assert.equal(item.overBudgetBy, null);
  assert.equal(item.priceSource, "serper_google_shopping");
  assert.equal(item.googleProductId, "9410598977096791099");
  assert.deepEqual(r.filteredOut, [{ modelId: "other", name: "Other Interface", reason: NO_MATCH_REASON }]);
  // #3, #5, #8 got no verdict → rejected as unchecked
  assert.deepEqual(r.rejected.map((x) => [x.candidateId, x.match]), [
    ["scarlett-2i2#3", "unchecked"], ["scarlett-2i2#4", "bundle"], ["scarlett-2i2#5", "unchecked"],
    ["scarlett-2i2#6", "different_model"], ["scarlett-2i2#8", "unchecked"],
  ]);
});

test("applyVerdicts: over-budget models are kept and labelled with a code-computed amount; in-budget first", () => {
  const cheap = { ...candidates[0], id: "other#1", modelId: "other", pricePaise: 1_500_000 };
  const r = applyVerdicts({ ...spec, budget: 20_000 }, [m2i2, mOther], [...candidates, cheap], [
    { id: "scarlett-2i2#1", match: "exact", reason: "" },
    { id: "other#1", match: "exact", reason: "" },
  ]);
  assert.deepEqual(r.items.map((i) => [i.modelId, i.withinBudget, i.overBudgetBy]), [["other", true, null], ["scarlett-2i2", false, 1073]]);
});

const offer = (store: string, rupees: number): Candidate => ({
  id: `m#${store}`, modelId: "m", title: "Galaxy Buds FE", store, pricePaise: rupees * 100, link: "https://www.google.com/x",
  linkType: "shopping", googleProductId: null, imageUrl: null, observedAt: NOW,
});
const prices = (cs: Candidate[]) => cs.map((c) => c.pricePaise / 100);

test("dropPriceOutliers: implausibly cheap offers removed; pairs, singles and normal spreads handled", () => {
  // The live-run case: ₹2,990 from an unknown shop vs ₹8,499 on Amazon.
  const pair = dropPriceOutliers([offer("Banjara", 2990), offer("Amazon", 8499)]);
  assert.deepEqual([prices(pair.kept), prices(pair.outliers)], [[8499], [2990]]);
  assert.deepEqual(prices(dropPriceOutliers([offer("A", 3099), offer("B", 4529)]).kept), [3099, 4529]);
  assert.deepEqual(prices(dropPriceOutliers([offer("A", 500)]).kept), [500]);
  const three = dropPriceOutliers([offer("A", 2990), offer("B", 8499), offer("C", 8999)]);
  assert.deepEqual(prices(three.outliers), [2990]);
  // The robot-vacuum live case: ₹1,42,249 from one shop when three others ask ~₹23,000.
  const high = dropPriceOutliers([offer("A", 22999), offer("B", 22999), offer("C", 24244), offer("Bling", 142249)]);
  assert.deepEqual([prices(high.kept), prices(high.outliers), [...high.tooHigh].map((c) => c.store)], [[22999, 22999, 24244], [142249], ["Bling"]]);
  // With two offers the high side isn't judged (₹19,854 vs ₹36,999 could be either one's fault).
  assert.deepEqual(prices(dropPriceOutliers([offer("A", 19854), offer("B", 36999)]).outliers), []);
});

test("applyVerdicts: a price outlier is rejected, not shown as the cheapest price", () => {
  const cands = [offer("Banjara", 2990), offer("Amazon", 8499)].map((c, i) => ({ ...c, id: `m#${i + 1}` }));
  const r = applyVerdicts({ ...spec, budget: 10_000 }, [researched("m", "Samsung Galaxy Buds FE")], cands, [
    { id: "m#1", match: "exact", reason: "" },
    { id: "m#2", match: "exact", reason: "" },
  ]);
  assert.equal(r.items[0].currentPrice, 8499);
  assert.deepEqual(r.rejected.map((x) => [x.store, x.match, x.reason]), [["Banjara", "price_outlier", OUTLIER_REASON]]);
});
