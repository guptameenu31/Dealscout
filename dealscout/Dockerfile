# DealScout API: runs `npm start` (= npm run dev without --watch, which crashes when .env is absent).
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 8080
CMD ["npm", "start"]
