import { test } from "node:test";
import assert from "node:assert/strict";
import { heuristicKitPlan, scoutKit } from "../src/kit.ts";
import { MockSource } from "../src/sources/mock.ts";

test("podcast request becomes a 4-item plan whose budgets track the total", () => {
  const plan = heuristicKitPlan("I'm starting a podcast, ₹30,000 total")!;
  assert.equal(plan.items.length, 4);
  assert.equal(plan.totalBudget, 30000);
  const sum = plan.items.reduce((a, i) => a + i.budget, 0);
  assert.ok(Math.abs(sum - 30000) <= 400);
  assert.equal(heuristicKitPlan("a new sofa"), undefined);
});

test("kit picks one product per item, stays in budget, and finds a leftover-funded upgrade", async () => {
  const plan = heuristicKitPlan("I'm starting a podcast, ₹30,000 total")!;
  const kit = await scoutKit(plan, new MockSource());
  assert.equal(kit.items.length, 4);
  assert.ok(kit.items.every((r) => r.pick), "every item has a pick");
  assert.ok(kit.total <= plan.totalBudget);
  assert.equal(kit.leftover, plan.totalBudget - kit.total);
  assert.ok(kit.upgrade, "leftover buys an upgrade");
  assert.ok(kit.upgrade!.extra > 0 && kit.upgrade!.extra <= kit.leftover);
  // The XLR requirement rules out the USB-only mic.
  const mic = kit.items.find((r) => r.item.role === "Microphone")!;
  assert.ok(!mic.options.some((o) => o.product.name === "Rode NT-USB Mini"));
});
