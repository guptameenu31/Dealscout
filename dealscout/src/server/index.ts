import { loadConfig } from "../config.ts";
import { createApp } from "./app.ts";

const config = loadConfig();
const app = createApp({ config });

const server = app.listen(config.PORT, (err?: Error) => {
  if (err) throw err;
  console.log(
    `DealScout API listening on http://localhost:${config.PORT} ` +
      `(live search: ${config.GEMINI_API_KEY ? `on, ${config.GEMINI_MODEL}` : "off - no GEMINI_API_KEY"})`,
  );
});

// Cloud Run sends SIGTERM before stopping an instance; finish in-flight requests first.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
