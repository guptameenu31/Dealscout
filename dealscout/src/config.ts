import { z } from "zod";

/** Treat empty strings in .env (e.g. `GEMINI_API_KEY=`) as "not set". */
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const env = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema);

const EnvSchema = z.object({
  PORT: env(z.coerce.number().int().positive().default(8080)),
  /** Optional. Without it, /api/spec uses the offline parser and /api/scout falls back to cached/seeded data. */
  GEMINI_API_KEY: env(z.string().trim().optional()),
  GEMINI_MODEL: env(z.string().trim().default("gemini-2.5-flash")),
  /** Max time for one live discovery before falling back. */
  LIVE_TIMEOUT_MS: env(z.coerce.number().int().positive().default(25_000)),
  /** Where the JSON price history and result cache are written (local dev; Firestore later). */
  DATA_DIR: env(z.string().default("data")),
  /** POST requests per minute per client IP on /api. 0 disables the limit. */
  RATE_LIMIT_PER_MIN: env(z.coerce.number().int().nonnegative().default(30)),
  /** Built React app to serve at / (created by `npm run build` in web/). */
  WEB_DIST: env(z.string().default("web/dist")),
  /** Set automatically by Cloud Run; shown by /healthz. */
  K_REVISION: env(z.string().default("dev")),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
