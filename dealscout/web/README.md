# DealScout web (React frontend)

Vite + React + TypeScript, Tailwind v4, React Query.

```bash
cd dealscout/web
cp .env.example .env     # VITE_USE_MOCK=true runs with no backend
npm install
npm run dev              # http://localhost:5173
npm run build            # outputs web/dist, which the backend serves
```

- **Mock mode** (`VITE_USE_MOCK=true`): all endpoints are served from `src/api/mock.ts`, using data from a real earbuds
  search. Type the word `fail` in a request to make the price lookup fail once and see the retry UI.
- **Real backend** (`VITE_USE_MOCK=false`): `/api` and `/healthz` are proxied to `http://localhost:8080`. No code changes needed.
- The API contract is in `src/api/types.ts` and `src/api/client.ts`.

## How a search runs

`src/lib/useSearch.ts` drives it, and the UI shows each step as it happens:

1. `POST /api/research` → shortlist of up to 5 models within budget + 2 "stretch" models. Cards appear right away.
2. Then, in parallel:
   - `POST /api/research/details`, **one request per model**: each card fills in with specs, must-have checks, what
     reviewers say and concerns as soon as its own request returns.
   - `POST /api/offers` → `POST /api/validate`: live Google Shopping listings are checked by AI (accessories, bundles,
     look-alikes skipped) and priced by the server. Prices land on the cards.

Each step can be retried on its own (retrying validate costs no Serper credits). Leaving the results page cancels
requests still in flight.

The **My watches** page is a preview of v1.2 (saved needs, scheduled price checks, email alerts); it makes no API calls.
`WatchModal`, `DigestModal` and the watch client calls are kept, unwired, for v1.2.
