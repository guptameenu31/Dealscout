# DealScout web: builds the app and serves it with `vite preview`, which proxies /api to API_URL (see vite.config.ts).
# Not the dev server: its live-reload WebSocket is closed by Cloud Run's request timeout, and Vite then reloads the
# page, wiping the user's search after ~5 minutes.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# VITE_USE_MOCK is baked in at build time; unset = call the real API.
RUN npm run build
EXPOSE 8080
# Cloud Run sets PORT; locally it defaults to 4173.
CMD ["sh", "-c", "npx vite preview --host 0.0.0.0 --port ${PORT:-4173} --strictPort"]
