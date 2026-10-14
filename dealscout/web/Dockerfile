# DealScout web: runs the Vite dev server. API_URL says where to proxy /api (see vite.config.ts).
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 5173
# Cloud Run sets PORT; locally it defaults to 5173.
CMD ["sh", "-c", "npm run dev -- --host 0.0.0.0 --port ${PORT:-5173}"]
