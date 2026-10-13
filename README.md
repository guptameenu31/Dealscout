# DealScout (hackathon prototype)

AI shopping scout that watches a *need*, not a product, and flags fake discounts using price history.

## Contents
- `DealScout-pitch.md`: pitch, demo script, slide outline, hackathon strategy, judge Q&A
- `dealscout/`: working prototype (TypeScript, no dependencies)

## Run it
Needs Node 22.18 or newer (check with `node -v`; `.nvmrc` pins 22).

```bash
cd dealscout
npm install          # dev tooling only (TypeScript, Node types); no runtime dependencies
cp .env.example .env # then add your GEMINI_API_KEY (optional)
npm run demo         # prints the watch spec + digest, writes out/digest.html
npm run check        # type-check + all tests
```

Other scripts: `npm test` (tests only), `npm run typecheck` (types only).

Open `dealscout/out/digest.html` in a browser to see the email-style digest.

Optional: set `GEMINI_API_KEY` in `dealscout/.env` to make the watch spec come from Gemini instead of the offline fallback. `.env` is git-ignored; never commit the key.

## What's real vs. fake
- Real: the verdict logic (`src/verdict.ts`), watch-spec parsing, digest rendering.
- Fake: product list and 60-day price history (`src/sources/mock.ts`). Real stores plug in via the `PriceSource` interface in `src/types.ts`.

## Not built yet
Gemini grounded-search discovery, Firestore, Cloud Run + Scheduler, sending real email, web form, slides.
