import { mkdirSync, writeFileSync } from "node:fs";
import { createGenerator, stepModels } from "./ai/generator.ts";
import { loadConfig } from "./config.ts";
import { renderHtml, renderText } from "./digest.ts";
import { HistoryStore } from "./historyStore.ts";
import { scout } from "./scout.ts";
import { GeminiSource } from "./sources/gemini.ts";
import { MockSource } from "./sources/mock.ts";
import { buildWatchSpec } from "./spec.ts";
import type { PriceSource } from "./types.ts";

// Usage: npm run demo -- [--live] [--seed-demo] "your request"
//   --live       discover real products with Gemini + Google Search (needs GEMINI_API_KEY or Vertex AI config)
//   --seed-demo  DEMO ONLY: backfill synthetic price history for newly found products
const args = process.argv.slice(2);
const live = args.includes("--live");
const seedDemo = args.includes("--seed-demo");
const query =
  args.filter((a) => !a.startsWith("--")).join(" ") ||
  "I need a 2-input USB audio interface with phantom power for home recording, under ₹15k";

const config = loadConfig();
const generator = createGenerator(config);
const { spec, via } = await buildWatchSpec(query, generator, stepModels(config).spec);
console.log(`Watch spec (via ${via}):`);
console.log(JSON.stringify(spec, null, 2), "\n");

let source: PriceSource = new MockSource();
let store: HistoryStore | undefined;
if (live) {
  if (!generator) {
    console.error("--live needs GEMINI_API_KEY or Vertex AI settings in .env. Using mock data instead.\n");
  } else {
    store = new HistoryStore("data/history.json");
    source = new GeminiSource({ generator }, store);
  }
}
console.log(`Source: ${source.name}\n`);

if (store && seedDemo) {
  // Discover first so there are products to seed, then let scout() re-run discovery for scoring.
  const found = await source.discover(spec);
  const n = found.filter((p) => store!.seedSynthetic(p.id, p.currentPrice)).length;
  console.log(`[demo] Seeded synthetic history for ${n} product(s). Not real price data.\n`);
}

let items;
try {
  items = await scout(spec, source);
} catch (err) {
  // Same idea as the server's fallback chain: never crash the demo, say what happened.
  const msg = String((err as Error)?.message ?? err).slice(0, 200);
  console.error(`Live search failed: ${msg}\nFalling back to seeded demo data (synthetic, not real prices).\n`);
  items = await scout(spec, new MockSource());
}
store?.save();
console.log(renderText(spec, items));

mkdirSync("out", { recursive: true });
writeFileSync("out/digest.html", renderHtml(spec, items));
console.log("\nWrote out/digest.html");
