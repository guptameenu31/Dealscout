import { loadConfig } from "../config.ts";
import { createApp } from "./app.ts";

const config = loadConfig();
const app = createApp({ config });

const server = app.listen(config.PORT, (err?: Error) => {
  if (err) throw err;
  console.log(
    `DealScout API listening on http://localhost:${config.PORT} (AI: ${
      config.GOOGLE_GENAI_USE_VERTEXAI
        ? `Vertex AI, ${config.GEMINI_MODEL}`
        : config.GEMINI_API_KEY
          ? `Gemini API key, ${config.GEMINI_MODEL}`
          : "off - set GEMINI_API_KEY or GOOGLE_GENAI_USE_VERTEXAI"
    })`,
  );
});

// Cloud Run sends SIGTERM before stopping an instance; finish in-flight requests first.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
