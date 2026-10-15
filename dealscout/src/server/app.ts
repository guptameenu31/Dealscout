import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import express, { type Express } from "express";
import { createGenerator, stepModels, type TextGenerator } from "../ai/generator.ts";
import { ResearchCache } from "../ai/research.ts";
import type { Config } from "../config.ts";
import { HistoryStore } from "../historyStore.ts";
import { GeminiSource } from "../sources/gemini.ts";
import { MockSource } from "../sources/mock.ts";
import { SerperClient } from "../sources/serper.ts";
import { buildWatchSpec, type BuiltSpec } from "../spec.ts";
import type { PriceSource } from "../types.ts";
import { apiNotFound, errorHandler } from "./middleware/errors.ts";
import { rateLimit } from "./middleware/rateLimit.ts";
import { requestLog } from "./middleware/requestLog.ts";
import { ResultCache } from "./resultCache.ts";
import { healthRouter } from "./routes/health.ts";
import { notImplementedRouter } from "./routes/notImplemented.ts";
import { pipelineRouter, type PipelineDeps } from "./routes/pipeline.ts";
import { scoutRouter } from "./routes/scout.ts";
import { specRouter } from "./routes/spec.ts";

export interface AppDeps {
  config: Config;
  /** Overrides for tests. Defaults are the real implementations. */
  /** Gemini access. Default: from config (Vertex AI or API key); null = AI disabled. */
  generator?: TextGenerator | null;
  buildSpec?: (query: string) => Promise<BuiltSpec>;
  /** null = live search disabled. Default: Gemini + Google Search when a generator is configured. */
  liveSource?: ((signal: AbortSignal) => PriceSource) | null;
  seededSource?: () => PriceSource;
  cache?: ResultCache;
  /** Serper Google Shopping client. Default: from SERPER_API_KEY; null = /api/offers disabled. */
  serper?: SerperClient | null;
  /** Overrides for the v1.1 pipeline endpoints (timeouts, research cache). */
  pipeline?: Partial<Pick<PipelineDeps, "shortlistCache" | "detailsCache" | "researchTimeoutMs" | "validateTimeoutMs">>;
  log?: boolean;
}

export function createApp(deps: AppDeps): Express {
  const { config } = deps;
  const history = new HistoryStore(join(config.DATA_DIR, "history.json"));
  const cache = deps.cache ?? new ResultCache(join(config.DATA_DIR, "cache.json"));
  const generator = deps.generator !== undefined ? deps.generator : createGenerator(config);
  const serper =
    deps.serper !== undefined ? deps.serper : config.SERPER_API_KEY ? new SerperClient({ apiKey: config.SERPER_API_KEY }) : null;
  const steps = stepModels(config);

  const liveSource =
    deps.liveSource !== undefined
      ? deps.liveSource
      : generator
        ? (signal: AbortSignal) => new GeminiSource({ generator, signal }, history)
        : null;

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true); // Cloud Run sits behind Google's proxy; needed for real client IPs
  if (deps.log !== false) app.use(requestLog);

  app.use(healthRouter(config.K_REVISION));

  const api = express.Router();
  api.use(express.json({ limit: "256kb" })); // /api/validate carries n models x k listings
  api.use(rateLimit(config.RATE_LIMIT_PER_MIN));
  api.use(specRouter(deps.buildSpec ?? ((q: string) => buildWatchSpec(q, generator, steps.spec))));
  api.use(
    scoutRouter({
      liveSource,
      seededSource: deps.seededSource ?? (() => new MockSource()),
      cache,
      liveTimeoutMs: config.LIVE_TIMEOUT_MS,
      afterLive: () => history.save(),
    }),
  );
  api.use(
    pipelineRouter({
      generator,
      serper,
      steps,
      topK: config.SERPER_TOP_K,
      shortlistCache: new ResearchCache(),
      detailsCache: new ResearchCache(),
      ...deps.pipeline,
    }),
  );
  api.use(notImplementedRouter());
  api.use(apiNotFound);
  app.use("/api", api);

  // The React app (web/dist) when it has been built; otherwise a small placeholder page.
  const dist = resolve(config.WEB_DIST);
  if (existsSync(join(dist, "index.html"))) {
    app.use(express.static(dist, { index: false, maxAge: "1h" }));
    app.get("/{*path}", (_req, res) => res.sendFile(join(dist, "index.html")));
  } else {
    app.get("/", (_req, res) => {
      res.type("html").send(
        `<!doctype html><title>DealScout API</title><body style="font-family:system-ui;max-width:560px;margin:48px auto;padding:0 16px">
<h1>DealScout API is running</h1><p>The web app has not been built yet (expected at <code>${config.WEB_DIST}</code>).</p>
<p>Try <a href="/api/health">/api/health</a>, or POST to <code>/api/spec</code> and <code>/api/scout</code>.</p></body>`,
      );
    });
  }

  app.use(errorHandler);
  return app;
}
