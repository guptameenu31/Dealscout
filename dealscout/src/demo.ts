import { mkdirSync, writeFileSync } from "node:fs";
import { renderHtml, renderText } from "./digest.ts";
import { scout } from "./scout.ts";
import { MockSource } from "./sources/mock.ts";
import { buildWatchSpec } from "./spec.ts";

const query = process.argv.slice(2).join(" ") || "I need a 2-input USB audio interface with phantom power for home recording, under ₹15k";

const { spec, via } = await buildWatchSpec(query);
console.log(`Watch spec (via ${via}):`);
console.log(JSON.stringify(spec, null, 2), "\n");

const items = await scout(spec, new MockSource());
console.log(renderText(spec, items));

mkdirSync("out", { recursive: true });
writeFileSync("out/digest.html", renderHtml(spec, items));
console.log("\nWrote out/digest.html");
