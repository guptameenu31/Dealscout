import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Where the backend runs. Local: localhost. Docker compose: http://api:8080. Cloud Run: the API service URL.
const apiUrl = process.env.API_URL ?? "http://localhost:8080";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: true, // accept the Cloud Run / container hostname, not just localhost
    proxy: {
      "/api": { target: apiUrl, changeOrigin: true },
      "/healthz": { target: apiUrl, changeOrigin: true },
    },
  },
});
