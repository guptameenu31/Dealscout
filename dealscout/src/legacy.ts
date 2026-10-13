import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { HistoryStore } from "./historyStore.ts";
import { buildKitPlan, scoutKit } from "./kit.ts";
import { scout } from "./scout.ts";
import { GeminiSource } from "./sources/gemini.ts";
import { MockSource } from "./sources/mock.ts";
import { buildWatchSpec } from "./spec.ts";
import type { PriceSource } from "./types.ts";

const root = join(import.meta.dirname, "..");
const hasKey = !!process.env.GEMINI_API_KEY;

const json = (res: ServerResponse, code: number, payload: unknown) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
};

/** The original single-file UI and its streaming endpoints, kept at /legacy. Returns true if handled. */
export async function handleLegacy(req: IncomingMessage, res: ServerResponse, body: any): Promise<boolean> {
  const url = req.url ?? "";
  try {
    if (req.method === "GET" && (url === "/legacy" || url === "/legacy/")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(readFileSync(join(root, "public/index.html")));
      return true;
    }
    if (req.method === "GET" && req.url === "/api/config") return json(res, 200, { liveAvailable: hasKey }), true;

    if (req.method === "POST" && req.url === "/api/scout" && !body.spec) {
      const { query, live } = body;
      if (typeof query !== "string" || !query.trim()) return json(res, 400, { error: "Describe what you want first." }), true;
      if (live && !hasKey) return json(res, 400, { error: "Live mode needs GEMINI_API_KEY on the server." }), true;

      // Stream newline-delimited JSON: trace events as the agent works, then the final result.
      res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache" });
      const send = (o: unknown) => res.write(JSON.stringify(o) + "\n");
      try {
        send({ event: "trace", kind: "info", text: "Reading your request…" });
        const { spec, via } = await buildWatchSpec(query.trim());
        const must = spec.mustHaves.length ? `, must have ${spec.mustHaves.join(" + ")}` : "";
        send({ event: "trace", kind: "info", text: `Built a watch spec (${via}): ${spec.category}, budget ₹${spec.budget.toLocaleString("en-IN")}${must}` });

        let source: PriceSource = new MockSource();
        let store: HistoryStore | undefined;
        if (live) {
          store = new HistoryStore(join(root, "data/history.json"));
          source = new GeminiSource({ apiKey: process.env.GEMINI_API_KEY! }, store);
        }
        const items = await scout(spec, source, (e) => send({ event: "trace", ...e }));
        store?.save();
        send({
          event: "result",
          spec,
          via,
          source: source.name,
          items: items.map((i) => ({ product: i.product, verdict: i.verdict, fit: i.fit, history: i.history.map((h) => h.price) })),
        });
      } catch (err) {
        send({ event: "error", error: (err as Error).message });
      }
      res.end();
          return true;
    }
    if (req.method === "POST" && req.url === "/api/kit") {
      const { query, live } = body;
      if (typeof query !== "string" || !query.trim()) return json(res, 400, { error: "Describe your goal and total budget first." }), true;
      if (live && !hasKey) return json(res, 400, { error: "Live mode needs GEMINI_API_KEY on the server." }), true;

      res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache" });
      const send = (o: unknown) => res.write(JSON.stringify(o) + "\n");
      try {
        send({ event: "trace", kind: "info", text: "Reading your goal…" });
        const planned = await buildKitPlan(query.trim());
        if (!planned) {
          send({ event: "error", error: "I can only plan a podcast kit offline. Set GEMINI_API_KEY to plan any goal." });
          res.end();
          return true;
        }
        const { plan, via } = planned;
        send({ event: "trace", kind: "info", text: `Planned a ${plan.goal} (${via}): ${plan.items.map((i) => i.role).join(", ")}` });

        let source: PriceSource = new MockSource();
        let store: HistoryStore | undefined;
        if (live) {
          store = new HistoryStore(join(root, "data/history.json"));
          source = new GeminiSource({ apiKey: process.env.GEMINI_API_KEY! }, store);
        }
        const kit = await scoutKit(plan, source, (e) => send({ event: "trace", ...e }));
        store?.save();
        const ser = (i: any) => ({ product: i.product, verdict: i.verdict, fit: i.fit, history: i.history.map((h: any) => h.price) });
        send({
          event: "result",
          via,
          source: source.name,
          plan: kit.plan,
          total: kit.total,
          leftover: kit.leftover,
          items: kit.items.map((r) => ({ item: r.item, options: r.options.map(ser), pickId: r.pick?.product.id ?? null })),
          upgrade: kit.upgrade && { role: kit.upgrade.role, from: kit.upgrade.from, extra: kit.upgrade.extra, to: ser(kit.upgrade.to) },
        });
      } catch (err) {
        send({ event: "error", error: (err as Error).message });
      }
      res.end();
          return true;
    }
  } catch (err) {
    json(res, 500, { error: (err as Error).message });
    return true;
  }
  return false;
}
