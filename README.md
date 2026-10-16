# DealScout

**Watch the need, not the product.**

DealScout is an AI shopping advisor for India. You describe what you need and what you can spend, in plain English. DealScout researches the options, finds real prices from Indian stores, and shows you what is worth buying, with the evidence.

**Live prototype:** https://dealscout-web-eugmzmqdna-el.a.run.app/ (a full search takes about a minute)

**Demo video:** https://drive.google.com/file/d/1aF0zHBZMzMZGKyF3YMHI5AmLXUrE2fNP/view (1.5 minutes)

Built for the Google Cloud AI Builder Cup 2026, category *Retail & Commerce: Intelligent Customer and Business Experiences*.

## The problem

Shopping for a specific need means checking many stores, reading reviews, Reddit threads and videos, and guessing whether a price is good. Price trackers only watch one product you have already chosen, so they never show you the better option you didn't know existed.

## What it does

1. **Describe.** Type a request such as "Wireless earbuds with ANC for my metro commute, under ₹10k".
2. **Understand.** Gemini turns it into a watch spec: category, budget, must-haves, nice-to-haves, exclusions. You can edit it before anything is searched.
3. **Shortlist.** Gemini with Google Search grounding picks up to 5 models within budget and up to 2 "stretch" models up to 30% over it, using reviews and community opinion.
4. **Research.** For each model, in parallel: specs, a check of every must-have with the evidence, what reviewers say, and concerns.
5. **Prices.** Live Google Shopping listings for India come from [Serper](https://serper.dev), one lookup per model.
6. **Validate.** Gemini accepts or rejects each listing (accessories, bundles, different models, refurbished). Code then builds every price.

Each result shows the lowest live price and its store, the other stores that sell it, why it fits, each must-have marked confirmed, and a link to the store's offer.

### Design principle: the AI advises, code checks the numbers

Gemini never produces a price or a link. It only refers to listings by an ID that the server created, and every ₹ figure is computed in code. A model can't invent a price it never outputs.

### Honest about its data

Every price in the web app names its store and links to that store's offer, and the results say the prices were checked live. If a step fails, the page says so and offers a retry. The one-call `POST /api/scout` endpoint also reports where its data came from (`live`, `cached` or `seeded` demo data) in a `provenance` field.

## Architecture

```
Browser
  │
  ▼
web  (Cloud Run)   React app, served by `vite preview`, proxies /api
  │
  ▼
api  (Cloud Run)   Node + Express, TypeScript
  ├── Vertex AI · Gemini    watch spec, shortlist, per-model research, listing validation (Google Search grounding)
  └── Serper                Google Shopping listings for India
```

The web app runs the search step by step (see API below). The one-call `POST /api/scout` endpoint falls back from live, to cached, to seeded demo data.

## API

The search runs as short, stateless calls, so the UI can show real progress and no request runs too long.

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Liveness and revision |
| `POST /api/spec` | Request text → watch spec (Gemini, or an offline parser without a key) |
| `POST /api/research` | Spec → shortlist of models (about 25 s) |
| `POST /api/research/details` | Models → specs, must-have checks, community opinion (parallel, about 25 s) |
| `POST /api/offers` | Models → top Google Shopping listings per model (about 6 s) |
| `POST /api/validate` | Listings → Gemini accepts or rejects; code builds the prices |
| `POST /api/scout` | One-call search with the live → cached → seeded fallback |
| `POST /api/digest/preview` | HTML email preview |
| `POST /api/digest/send`, `/api/watches...` | Not built yet; answer `501 NOT_IMPLEMENTED` |

## Run it locally

Needs Node 22.18 or newer.

**API** (port 8080):

```bash
cd dealscout
cp .env.example .env     # add GEMINI_API_KEY and SERPER_API_KEY
npm install
npm run dev
```

**Web** (port 5173, proxies `/api` to the API):

```bash
cd dealscout/web
cp .env.example .env     # VITE_USE_MOCK=true runs with no backend at all
npm install
npm run dev
```

Set `VITE_USE_MOCK=false` in `dealscout/web/.env` to use the real API.

**Tests and type-check:**

```bash
cd dealscout
npm run check
```

`docker compose up --build` in `dealscout/` runs both services in containers. It expects Google application-default credentials for Vertex AI (see the comments in `docker-compose.yml`).

### Configuration

All settings are environment variables; see `dealscout/.env.example` for the full list.

| Variable | What it does |
|---|---|
| `GEMINI_API_KEY` | Gemini through AI Studio, for local development |
| `GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` | Gemini on Vertex AI, used on Cloud Run |
| `GEMINI_MODEL` and per-step `GEMINI_*_MODEL` | Models for the spec, research, validator and advisor steps |
| `SERPER_API_KEY` | Google Shopping prices. Unset means no live prices |
| `LIVE_TIMEOUT_MS`, `GEMINI_HEDGE_MS` | Live-search time limit, and when to start a backup Gemini call |
| `RATE_LIMIT_PER_MIN` | Per-IP limit on `POST /api` |
| `DATA_DIR` | Where the result cache is stored |

Never commit a `.env` file. Keys are read from the environment only.

## Repository layout

```
dealscout/
  src/ai/        Gemini steps: research, listing validator, text generator
  src/sources/   Serper client, demo data, Gemini source
  src/server/    Express app, routes, middleware, caches
  test/          Unit and API tests
  web/           React app (Vite, TypeScript, Tailwind, React Query)
```

## Status

**Working today**
- Plain-English request → editable watch spec → researched shortlist → live prices from Indian stores, with evidence for each pick
- Deployed on Google Cloud Run, using Gemini on Vertex AI
- Cached research for repeat searches, and clear errors with a retry when a step fails

**Next**
- Saved watches that keep checking a need, with real price history stored in Firestore
- Scheduled checks (Cloud Scheduler) and email alerts
- More product categories, and official retailer APIs in place of search-based prices

**Not claimed yet**
- Fake-discount detection on live data. It needs weeks of real price history, which starts when a shopper begins watching a need.
- Coverage of every store or every product.

Prices come from public store listings. Verify on the retailer's site before buying.
