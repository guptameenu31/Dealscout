import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSpec } from "../src/watchSpec.ts";
import { computeStats } from "../src/stats.ts";

test("normalizeSpec keeps the user's stated budget over Gemini's", () => {
  const { spec, warnings } = normalizeSpec("interface under 15k", { category: "audio interface", budget: 20000 }, 15000);
  assert.equal(spec.budget, 15000);
  assert.match(warnings[0], /Kept your stated budget/);
});

test("normalizeSpec survives junk AI output", () => {
  const { spec, warnings } = normalizeSpec("something nice", { budget: "lots", mustHaves: "x", category: 42 }, undefined);
  assert.equal(spec.category, "product");
  assert.equal(spec.budget, 15000);
  assert.deepEqual(spec.mustHaves, []);
  assert.deepEqual(spec.searchTerms, ["product"]);
  assert.match(warnings[0], /assumed/);
});

test("normalizeSpec trims, dedupes and caps lists; clarification only when flagged", () => {
  const { spec } = normalizeSpec(
    "q",
    { category: " Mic ", budget: 5000, mustHaves: [" XLR ", "xlr", "", "USB"], clarificationQuestion: "ignored" },
    undefined,
  );
  assert.equal(spec.category, "Mic");
  assert.deepEqual(spec.mustHaves, ["XLR", "USB"]);
  assert.equal(spec.clarificationQuestion, null);
});

test("computeStats", () => {
  assert.equal(computeStats([]), null);
  const s = computeStats([
    { date: "2026-10-01", price: 100, provenance: "seeded" },
    { date: "2026-10-03", price: 300 },
    { date: "2026-10-02", price: 200, provenance: "live" },
  ])!;
  assert.deepEqual(
    { ...s },
    { count: 3, lowest: 100, median: 200, highest: 300, firstDate: "2026-10-01", lastDate: "2026-10-03", days: 3, seededCount: 1 },
  );
});
