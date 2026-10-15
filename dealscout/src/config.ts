import { z } from "zod";

/** Treat empty strings in .env (e.g. `GEMINI_API_KEY=`) as "not set". */
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const env = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema);

const EnvSchema = z.object({
  PORT: env(z.coerce.number().int().positive().default(8080)),
  /** Gemini API key (local dev). Without any AI config, /api/spec uses the offline parser and /api/scout falls back. */
  GEMINI_API_KEY: env(z.string().trim().optional()),
  /** true = use Vertex AI in GOOGLE_CLOUD_PROJECT (no key; Cloud Run's service account). Wins over GEMINI_API_KEY. */
  GOOGLE_GENAI_USE_VERTEXAI: env(
    z
      .enum(["true", "false", "1", "0"])
      .default("false")
      .transform((v) => v === "true" || v === "1"),
  ),
  GOOGLE_CLOUD_PROJECT: env(z.string().trim().optional()),
  GOOGLE_CLOUD_LOCATION: env(z.string().trim().default("global")),
  GEMINI_MODEL: env(z.string().trim().default("gemini-3.8-flash")),
  /** Per-step model overrides (see stepModels); each defaults to GEMINI_MODEL. */
  GEMINI_SPEC_MODEL: env(z.string().trim().optional()),
  GEMINI_RESEARCH_MODEL: env(z.string().trim().optional()),
  GEMINI_ADVISOR_MODEL: env(z.string().trim().optional()),
  GEMINI_VALIDATOR_MODEL: env(z.string().trim().optional()),
  /** Start a backup Gemini call (low thinking) when one hasn't answered after this many ms. 0 disables. */
  GEMINI_HEDGE_MS: env(z.coerce.number().int().nonnegative().default(50_000)),
  /** Serper.dev key for Google Shopping prices (server-side only). Unset = v1 Gemini-only path. */
  SERPER_API_KEY: env(z.string().trim().optional()),
  /** Serper results per researched model passed to the AI validator (n models x k listings). */
  SERPER_TOP_K: env(z.coerce.number().int().min(1).max(20).default(5)),
  /** Max time for one live discovery before falling back. */
  LIVE_TIMEOUT_MS: env(z.coerce.number().int().positive().default(120_000)),
  /** Where the JSON price history and result cache are written (local dev; Firestore later). */
  DATA_DIR: env(z.string().default("data")),
  /** POST requests per minute per client IP on /api. 0 disables the limit. */
  RATE_LIMIT_PER_MIN: env(z.coerce.number().int().nonnegative().default(60)), // one search is ~11 POSTs
  /** Built React app to serve at / (created by `npm run build` in web/). */
  WEB_DIST: env(z.string().default("web/dist")),
  /** Set automatically by Cloud Run; shown by /healthz and /api/health. */
  K_REVISION: env(z.string().default("dev")),
});

const ConfigSchema = EnvSchema.refine((c) => !c.GOOGLE_GENAI_USE_VERTEXAI || !!c.GOOGLE_CLOUD_PROJECT, {
  message: "GOOGLE_CLOUD_PROJECT is required when GOOGLE_GENAI_USE_VERTEXAI=true",
  path: ["GOOGLE_CLOUD_PROJECT"],
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
