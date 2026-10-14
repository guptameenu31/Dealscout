# DealScout web (React frontend)

Built from `FRONTEND_BRIEF.md`. Vite + React + TypeScript, Tailwind v4, Recharts, React Query.

```bash
cd dealscout/web
cp .env.example .env     # VITE_USE_MOCK=true runs with no backend
npm install
npm run dev              # http://localhost:5173
npm run build            # outputs web/dist, which the backend serves
```

- **Mock mode** (`VITE_USE_MOCK=true`): all endpoints are served from `src/api/mock.ts`. Type the word `fail` in a request to see the cached-results banner.
- **Real backend** (`VITE_USE_MOCK=false`): `/api` and `/healthz` are proxied to `http://localhost:8080`. No code changes needed.
- The API contract is in `src/api/types.ts` and `src/api/client.ts`.
