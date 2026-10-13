import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HistoryStore } from "./historyStore.ts";
import { scout } from "./scout.ts";
import { GeminiSource } from "./sources/gemini.ts";
import { MockSource } from "./sources/mock.ts";
import { buildWatchSpec } from "./spec.ts";
import type { PriceSource } from "./types.ts";

const root = join(import.meta.dirname, "..");
const port = Number(process.env.PORT ?? 3000);
const hasKey = !!process.env.GEMINI_API_KEY;

const json = (res: import("node:http").ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const readBody = (req: import("node:http").IncomingMessage) =>
  new Promise<string>((resolve) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => resolve(s));
  });

createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(readFileSync(join(root, "public/index.html")));
    }
    if (req.method === "GET" && req.url === "/api/config") return json(res, 200, { liveAvailable: hasKey });

    if (req.method === "POST" && req.url === "/api/scout") {
      const { query, live } = JSON.parse((await readBody(req)) || "{}");
      if (typeof query !== "string" || !query.trim()) return json(res, 400, { error: "Describe what you want first." });

      const { spec, via } = await buildWatchSpec(query.trim());
      let source: PriceSource = new MockSource();
      let store: HistoryStore | undefined;
      if (live) {
        if (!hasKey) return json(res, 400, { error: "Live mode needs GEMINI_API_KEY on the server." });
        store = new HistoryStore(join(root, "data/history.json"));
        source = new GeminiSource({ apiKey: process.env.GEMINI_API_KEY! }, store);
      }
      const items = await scout(spec, source);
      store?.save();
      return json(res, 200, {
        spec,
        via,
        source: source.name,
        items: items.map((i) => ({
          product: i.product,
          verdict: i.verdict,
          history: i.history.map((h) => h.price),
        })),
      });
    }
    json(res, 404, { error: "Not found" });
  } catch (err) {
    json(res, 500, { error: (err as Error).message });
  }
}).listen(port, () => console.log(`DealScout UI on http://localhost:${port}`));
