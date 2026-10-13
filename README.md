# DealScout (hackathon prototype)

AI shopping scout that watches a *need*, not a product, and flags fake discounts using price history.

## Contents
- `DealScout-pitch.md`: pitch, demo script, slide outline, hackathon strategy, judge Q&A
- `dealscout/`: working prototype (TypeScript, no dependencies)

## Run it
Needs Node 22.18 or newer (check with `node -v`).

```bash
cd dealscout
npm run demo     # prints the watch spec + digest, writes out/digest.html
npm test         # 9 tests
```

Open `dealscout/out/digest.html` in a browser to see the email-style digest.

Optional: `export GEMINI_API_KEY=...` makes the watch spec come from Gemini instead of the offline fallback. Never commit the key.

## Backend API (for the React frontend)
`npm run ui` (in `dealscout/`) starts the backend on **port 8080**. It implements the frozen contract in `FRONTEND_BRIEF.md`:
`GET /healthz`, `POST /api/spec`, `POST /api/scout`, `POST /api/digest/preview`, `POST /api/digest/send` (501 until email is wired), and `/api/watches` (create, list, get, check, delete).

- Modes: `auto` tries live Gemini search (25 s limit), then the last cached live result, then seeded demo data. `live` and `seeded` force one source. Without `GEMINI_API_KEY`, `auto` serves seeded data and `live` returns 502.
- If `dealscout/web/dist/` exists (the React build), the server serves it at `/`. Otherwise `/` redirects to the original single-page UI at `/legacy`.
- Live products get synthetic price history, labelled `provenance: "seeded"` in the response. Set `DEALSCOUT_SEED_HISTORY=0` to turn that off.
- Local data (watches, history, cache) is written to `dealscout/data/` (git-ignored). Tests use a temp folder via `DEALSCOUT_DATA_DIR`.

## What's real vs. fake
- Real: the verdict logic (`src/verdict.ts`), watch-spec parsing, digest rendering.
- Fake: product list and 60-day price history (`src/sources/mock.ts`). Real stores plug in via the `PriceSource` interface in `src/types.ts`.

## Not built yet
Gemini grounded-search discovery, Firestore, Cloud Run + Scheduler, sending real email, web form, slides.
