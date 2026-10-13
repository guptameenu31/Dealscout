# DealScout API (+ built React app when dealscout/web exists). Used by Cloud Run and docker compose.

# --- Stage 1: build the frontend if it exists (web/ is optional until the UI lands) ---
FROM node:22-slim AS web
WORKDIR /app
COPY . .
RUN if [ -f web/package.json ]; then cd web && npm ci && npm run build; fi && mkdir -p web/dist

# --- Stage 2: runtime ---
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/tmp/dealscout
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY --from=web /app/web/dist ./web/dist
USER node
EXPOSE 8080
# Node >= 22.18 runs TypeScript directly (type stripping), so there is no build step.
CMD ["node", "src/server/index.ts"]
