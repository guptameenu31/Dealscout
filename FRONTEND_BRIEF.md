# DealScout — Frontend Brief (React)

> **How to use this file:** paste this entire file into Claude and say:
> *"Build the DealScout frontend described in this brief. Start with the project setup and the mock API, then build the screens in the order listed in section 9."*
>
> You do **not** need to understand the backend. Everything the frontend needs is in this file. The API contract in section 4 is **frozen for the prototype** — build against it exactly. If something seems missing, ask Adhish before inventing a field.

---

## 1. What DealScout is (30-second version)

**Tagline:** *Watch the need, not the product.*

A shopper types what they need in plain English — *"2-input USB audio interface with phantom power for home recording, under ₹15,000"*. DealScout:

1. Uses **Gemini (Google AI)** to turn the sentence into a structured *watch spec* (category, budget, must-haves…). The user can review and edit it.
2. Finds matching products across Indian stores (Amazon.in, Flipkart, niche music stores) using **Gemini + Google Search**.
3. Compares each product's current price with its **price history** and gives a verdict: **Buy now**, **Wait**, or **Over budget**.
4. Flags **inflated "was" prices** — e.g. the store says "33% off ₹17,999", but the product never actually sold above ₹13,899, so the real discount is ~12%.
5. Emails a digest and can keep watching the need on a schedule.

**The single most important UI moment** (judges will remember this): a product card showing *"Store says 33% off · Really 12% off"* next to a price-history chart where the store's claimed original price sits far above every real price.

This is a hackathon prototype for the Google Cloud AI Builder Cup (deadline **Oct 18, 2026**). Judging weights: Technical/GenAI 40%, Problem & Impact 25%, Innovation 25%, **UX 10%**. The UI must be polished, honest and reliable in a live demo — not feature-heavy.

---

## 2. Tech stack (use exactly this)

| Concern | Choice |
|---|---|
| Framework | **React 18+ with TypeScript**, created with **Vite** (`react-ts` template) |
| Styling | **Tailwind CSS v4** (`tailwindcss` + `@tailwindcss/vite`) |
| Charts | **Recharts** |
| Icons | **lucide-react** |
| Routing | **react-router-dom** (only 2 routes, see §6) |
| Data fetching | **@tanstack/react-query** (loading/error/retry states for free) |
| Fonts | **Inter** (Google Fonts) |

No other UI kits. No state-management library beyond React Query + `useState`/`useContext`.

---

## 3. Project setup and folder rules

The frontend lives in its **own folder** inside the repo. Do not touch anything outside it.

```
Dealscout1/
  dealscout/          ← backend (Adhish) — DO NOT EDIT anything here except the web/ folder
    src/ test/ package.json ...
    web/              ← YOUR frontend lives here (its own package.json)
```

Setup (run inside `Dealscout1/dealscout/`):

```bash
npm create vite@latest web -- --template react-ts
cd web
npm install
npm install react-router-dom @tanstack/react-query recharts lucide-react
npm install -D tailwindcss @tailwindcss/vite
```

`web/vite.config.ts` — Tailwind plugin + proxy so `/api` calls go to the backend in development (no CORS needed):

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:8080",
      "/healthz": "http://localhost:8080",
    },
  },
});
```

`web/src/index.css` starts with `@import "tailwindcss";`.

`web/.env.example` (commit this; never commit `.env`):

```
# true = use the built-in mock API (no backend needed). false = call the real backend.
VITE_USE_MOCK=true
```

**Rules:**
- Always call the API with **relative URLs** (`/api/scout`, never `http://localhost:8080/api/scout`). In production the backend serves the built frontend from the same origin.
- `npm run build` must produce `web/dist/` — the backend will serve that folder. Do not change the output dir.
- Work on a branch named `feature/ui` and open a pull request into `main`. Do not push directly to `main`.

---

## 4. API contract (frozen for the prototype)

Base URL: same origin. All bodies are JSON. All money is **Indian Rupees as whole numbers** (e.g. `11999` = ₹11,999). All timestamps are **ISO 8601 strings** (UTC). Dates in history are `YYYY-MM-DD`.

### 4.1 Shared types — copy into `web/src/api/types.ts` verbatim

```ts
export type Provenance = "live" | "cached" | "seeded";
export type ScoutMode = "auto" | "live" | "seeded";
export type VerdictLabel = "buy_now" | "wait" | "skip";
export type Confidence = "high" | "medium" | "low";

export interface WatchSpec {
  query: string;                 // the user's original sentence
  category: string;              // e.g. "audio interface"
  budget: number;                // max price in INR, whole rupees
  currency: "INR";
  mustHaves: string[];           // hard requirements
  niceToHaves: string[];
  excluded: string[];            // features the user does NOT want
  searchTerms: string[];         // used by the backend; show read-only or hide
  needsClarification: boolean;
  clarificationQuestion: string | null;
}

export interface Product {
  id: string;
  name: string;                  // "Focusrite Scarlett 2i2 (3rd Gen)"
  store: string;                 // "Amazon.in"
  url: string;                   // link to the store page (open in new tab)
  currentPrice: number;          // INR
  claimedOriginal: number | null;// store's struck-through "was"/MRP price, if shown
  features: string[];            // ["2 inputs", "USB-C", "48V phantom power"]
  observedAt: string;            // when currentPrice was seen (ISO)
}

export interface PricePoint {
  date: string;                  // "YYYY-MM-DD"
  price: number;                 // INR
  provenance: "live" | "seeded"; // seeded = synthetic demo data, must be visually distinct
}

export interface PriceStats {
  count: number;                 // number of observations
  lowest: number;
  median: number;
  highest: number;
  firstDate: string;             // "YYYY-MM-DD"
  lastDate: string;
  days: number;                  // calendar days covered
  seededCount: number;           // how many of the points are synthetic
}

export interface Verdict {
  label: VerdictLabel;           // buy_now | wait | skip (skip = over budget)
  confidence: Confidence;
  reasons: string[];             // human-readable, show as bullet list
  fakeDiscount: boolean;         // true = store's "was" price looks inflated
  realDiscountPct: number;       // vs. typical (median) price, e.g. 11.8
  claimedDiscountPct: number;    // what the store claims, e.g. 33.3 (0 if no claim)
  isLowestSeen: boolean;         // current price is below every recorded price
}

export interface ScoredItem {
  product: Product;
  history: PricePoint[];         // oldest first; may be empty
  stats: PriceStats | null;      // null when history is empty
  verdict: Verdict;
  dataNotes: string[];           // limitations, e.g. "History includes 45 synthetic points"
}

export interface ScoutResponse {
  runId: string;
  generatedAt: string;           // ISO
  provenance: Provenance;        // where the PRODUCT LIST came from
  fallbackReason: string | null; // why we fell back (e.g. "Live search timed out"), else null
  cachedAt: string | null;       // when the cached result was originally fetched (provenance=cached)
  spec: WatchSpec;
  items: ScoredItem[];           // already sorted: buy_now first, then wait, then skip
  filteredOut: { name: string; store: string; reason: string }[]; // found but didn't meet must-haves
}

export interface Watch {
  id: string;
  spec: WatchSpec;
  email: string;
  createdAt: string;
  lastCheckedAt: string | null;
  lastResult: ScoutResponse | null;
}

export interface ApiError {
  error: { code: ErrorCode; message: string; details?: unknown };
}
export type ErrorCode =
  | "VALIDATION_ERROR"   // 400 — show message next to the form
  | "NOT_FOUND"          // 404
  | "RATE_LIMITED"       // 429 — "Too many requests, try again in a minute"
  | "UPSTREAM_ERROR"     // 502 — AI/search provider failed
  | "NOT_IMPLEMENTED"    // 501 — feature not ready: hide or disable that UI, never crash
  | "INTERNAL";          // 500
```

### 4.2 Endpoints

| # | Method & path | Request body | Success response | Notes |
|---|---|---|---|---|
| 1 | `GET /healthz` | — | `{ ok: true, version: string }` | Use for a tiny "API online" dot in the footer. |
| 2 | `POST /api/spec` | `{ request: string }` (5–500 chars) | `{ spec: WatchSpec, via: "gemini" \| "heuristic", warnings: string[] }` | 1–5 s. `via` tells you whether Gemini understood it. |
| 3 | `POST /api/scout` | `{ spec: WatchSpec, mode?: ScoutMode }` (default `"auto"`) | `ScoutResponse` | **Can take 5–30 s** in live mode. Never times out client-side before 45 s. |
| 4 | `POST /api/digest/preview` | `{ spec: WatchSpec, mode?: ScoutMode }` | `{ subject: string, html: string }` | Email HTML to show in a preview modal. |
| 5 | `POST /api/digest/send` | `{ spec: WatchSpec, email: string, mode?: ScoutMode }` | `{ sent: true, to: string }` | May return **501** until email is wired — then disable "Send" with a tooltip "Email sending coming soon". |
| 6 | `POST /api/watches` | `{ spec: WatchSpec, email: string }` | `Watch` | May return **501** initially. |
| 7 | `GET /api/watches` | — | `{ watches: Watch[] }` | May return **501** initially → show the empty state. |
| 8 | `GET /api/watches/:id` | — | `Watch` | |
| 9 | `POST /api/watches/:id/check` | — | `Watch` (with fresh `lastResult`) | "Check now" button. Slow like `/api/scout`. |
| 10 | `DELETE /api/watches/:id` | — | `{ deleted: true }` | |

**Errors:** any non-2xx response has the `ApiError` body. Write one `apiFetch<T>()` helper that throws a typed error containing `code` and `message`; every screen shows `message` in a friendly error state with a **Retry** button.

**Modes** (`ScoutMode`): `auto` = try live search, fall back to the last cached live result, then to seeded demo data. `live` = live only (errors if it fails). `seeded` = demo data only (fast, always works). The UI default is `auto`.

---

## 5. Mock API (build this FIRST so you are never blocked)

Create `web/src/api/client.ts` exporting one function per endpoint (`getSpec`, `scout`, `previewDigest`, `sendDigest`, `createWatch`, `listWatches`, `getWatch`, `checkWatch`, `deleteWatch`, `health`). If `import.meta.env.VITE_USE_MOCK === "true"` they return data from `web/src/api/mock.ts` after an artificial delay (spec 800 ms, scout 2500 ms); otherwise they call the real endpoints.

Mock requirements:
- `getSpec` returns a spec derived from the text (e.g. parse a number for budget, default 15000) with `via: "heuristic"`; if the text contains the word "something", return `needsClarification: true` and `clarificationQuestion: "What will you mainly use it for?"`.
- `scout` returns a `ScoutResponse` with `provenance: "seeded"` and these **six products** so every UI state is exercised. Generate 60 days of history programmatically (random noise ±3% around a base, oldest first, `provenance: "seeded"`) and compute `stats` from it:

| Product | Store | currentPrice | claimedOriginal | history base | verdict | fakeDiscount | notes |
|---|---|---|---|---|---|---|---|
| Behringer UMC204HD | Amazon.in | 9499 | 12999 | 11000 (first 10 days at 12999) | buy_now, high | false | isLowestSeen true, real ≈ 13.6% |
| Focusrite Scarlett 2i2 (3rd Gen) | Amazon.in | 11999 | 17999 | 13500 | buy_now, high | **true** | claimed 33.3%, real 11.8% — the hero card |
| PreSonus AudioBox USB 96 | Flipkart | 8499 | 12999 | 8500 | wait, high | **true** | claimed 34.6%, real 0% |
| M-Audio M-Track Duo | Musicians Hub | 9199 | 10999 | 8800 | wait, medium | true | reason "Price has been falling over the last week…" |
| Tascam US-2x2HR | Sweetwater India | 13499 | null | 13800, **only 6 days** | wait, **low** | false | reason "Only 6 days of price history…" |
| Audient iD4 MKII | Amazon.in | 20999 | 24999 | 22000 | **skip** | false | reason "₹20,999 is over your ₹15,000 budget." |

  Use `https://example.com/...` URLs in mocks. Add one `filteredOut` entry: `{ name: "Generic USB Sound Card", store: "Flipkart", reason: "Missing: 48V phantom power" }`. Add `dataNotes: ["Price history is synthetic demo data (60 points)."]` to every item.
- A second mock variant (toggle with the text "fail" in the request) returns `provenance: "cached"`, `cachedAt` = yesterday, `fallbackReason: "Live search timed out after 25s"` — so the fallback banner can be built and tested.
- `sendDigest`, `createWatch`, `listWatches` in mock mode: return success; keep watches in memory.

---

## 6. Screens and user flow

Two routes: **`/`** (the main flow, a single page that progresses through steps) and **`/watches`**.

```
[1 Describe need] → [2 Review spec] → [3 Results] → (Product detail drawer)
                                            ↓
                              [Email digest]  [Watch this need] → /watches
```

### Screen 1 — Describe your need (hero)
- Headline: **"Watch the need, not the product."** Sub: *"Tell DealScout what you want and what you can spend. It finds matches across stores and tells you if a deal is real."*
- One large textarea (auto-grow, 2–4 lines), placeholder: *"e.g. 2-input USB audio interface with phantom power for home recording, under ₹15,000"*.
- 3 clickable example chips below it that fill the textarea: *"USB audio interface, 2 inputs, under ₹15k"*, *"Digital piano with weighted keys under ₹40,000"*, *"MIDI keyboard 49 keys under ₹10k"*.
- Primary button **"Understand my need"** (disabled when < 5 chars). Enter submits, Shift+Enter = newline.
- Loading: button shows spinner + "Gemini is reading your request…".

### Screen 2 — Review the watch spec ("Here's what I understood")
- Card with an **"Understood by Gemini ✦"** badge when `via === "gemini"`, or a neutral "Basic parsing (AI unavailable)" badge when `"heuristic"`.
- If `needsClarification`: an amber callout with `clarificationQuestion` and a text box; submitting appends the answer to the original request and calls `/api/spec` again.
- Editable fields (the user must be able to fix anything before searching — the app must never silently change budget or must-haves):
  - Category (text input)
  - Budget (number input with ₹ prefix, formatted en-IN)
  - Must-haves / Nice-to-haves / Excluded — each an editable **chip list** (× to remove, small input to add). Must-have chips solid, nice-to-have outlined, excluded red-outlined with a strike icon.
- Show `warnings` (if any) as small grey notes.
- Primary **"Find deals"** → calls `/api/scout` with the edited spec. Secondary "Start over".
- Small "Data source" segmented control, collapsed under an "Advanced" disclosure: **Auto (recommended) · Live only · Demo data**. Default Auto.

### Screen 3 — Results
- **Progress state while scouting** (5–30 s): a checklist that advances on a timer (it does not need real server progress): "Searching stores with Google Search…" → "Reading prices…" → "Checking price history…" → "Spotting fake discounts…". Plus 3 skeleton cards. Must feel alive, never a blank spinner.
- **Data-provenance banner** at the top — always visible, never hidden:
  - `live`: green dot · "Live results · fetched {relative time}"
  - `cached`: amber · "Showing saved results from {cachedAt, relative} · live search unavailable ({fallbackReason})" + "Try live again" button
  - `seeded`: blue/purple · "Demo data · products and price history are synthetic, for demonstration" 
- **Summary strip**: "{n} matches under ₹{budget} · {x} Buy now · {y} inflated discounts spotted · {z} over budget".
- **Filter tabs**: All · Buy now · Wait · Over budget (with counts).
- **Product cards** (grid: 1 col mobile, 2 col tablet, 3 col desktop). Each card:
  - Verdict badge top-right with icon + text (never colour alone): ✓ **Buy now** (green), ⏸ **Wait** (amber), ⊘ **Over budget** (grey). Confidence as a small dot-meter or "High/Medium/Low confidence" text.
  - Product name (2-line clamp), store name with a small store icon.
  - Price block: **₹11,999** large; claimed original struck-through beside it if present.
  - **Discount truth line** (the hero element) when `claimedDiscountPct > 0`:
    - If `fakeDiscount`: red/rose pill **"⚠ Inflated discount"** and the line *"Store says **33% off** · Really **12% off**"* (round to whole %).
    - Else: green line *"Genuine {claimed}% off"*.
  - `isLowestSeen` → small teal tag **"Lowest in {stats.days} days"**.
  - A **sparkline** of `history` (Recharts, ~40 px tall, no axes).
  - First reason from `verdict.reasons` as one line of muted text.
  - Footer: "View details" (opens drawer) · "Open at {store} ↗" (new tab, `rel="noopener noreferrer"`).
  - Over-budget cards are visually de-emphasised (reduced opacity) and listed last.
- If `filteredOut` is non-empty: a collapsible "{n} products didn't meet your must-haves" list with reasons (shows the AI isn't hiding anything).
- **Action bar** below results: **"Email me this digest"** and **"Watch this need"**.
- Empty state (0 items): friendly illustration/icon, "No matches under ₹{budget}. Try raising the budget or removing a must-have." with a button back to the spec.

### Product detail drawer (right side sheet on desktop, full-screen sheet on mobile)
- Header: name, store, price, verdict badge, "Open at store ↗".
- **Price history chart** (Recharts `LineChart`, ~280 px tall):
  - Line of `history` prices; x = date (format "12 Sep"), y = ₹ (format "₹12k").
  - Horizontal reference lines: **median** (grey dashed, label "Typical ₹12,549"), **lowest** (teal dotted).
  - If `claimedOriginal`: a **red dashed reference line labelled "Store's 'was' price ₹17,999"** — this visual gap above the real prices is the demo's money shot.
  - Today's price as a highlighted dot at the end.
  - Seeded points: render the line **dashed and lighter** with a legend entry "Synthetic demo history"; live points solid.
  - Tooltip: date, price, "(synthetic)" when seeded.
- **Stats tiles** (2×3 grid): Lowest · Typical (median) · Highest · Observations · Period ("{firstDate} – {lastDate}, {days} days") · Synthetic points ("{seededCount} of {count}").
- **"Why this verdict"**: all `verdict.reasons` as a list, plus confidence explained in one line ("Low confidence: less than 2 weeks of data").
- **Data notes**: `dataNotes` in a muted info box.
- Features as small chips.

### Email digest
- "Email me this digest" opens a modal: email input (validated), **Preview** (renders `/api/digest/preview` `html` inside an `<iframe srcDoc>` sandboxed, max-height 70vh) and **Send** (`/api/digest/send`).
- On 501: Send disabled with tooltip "Email sending coming soon"; Preview still works.
- Success: toast "Digest sent to {email}".

### Watches page (`/watches`)
- "Watch this need" (from Results) asks for email (prefill from digest modal), calls `POST /api/watches`, then toast + link "View your watches".
- `/watches`: list of watch cards — category, budget, must-have chips, email, "Last checked {relative}" and a mini summary from `lastResult` ("2 Buy now · 1 inflated discount"), buttons **Check now** (spinner, slow) · **View results** (shows the same Results view for `lastResult`) · **Delete** (confirm with an inline "Are you sure?" — no browser `confirm()` dialogs).
- 501 or empty → empty state: "No watches yet. Describe a need and tap 'Watch this need' — DealScout will check prices daily and email you."

### Global layout
- Top nav: logo wordmark **DealScout** (a simple radar/scope icon from lucide, e.g. `Radar`), links "New search" · "My watches".
- Footer: "Prices from public store listings; verify on the retailer's site before buying. Verdicts are based on observed price history, not predictions." + API status dot from `/healthz`.

---

## 7. Visual design requirements

- **Feel:** calm, trustworthy, modern consumer-fintech (think a clean banking app, not a flashy deal site). Lots of white space, rounded-2xl cards, soft shadows (`shadow-sm`, hover `shadow-md`), 1px slate borders.
- **Palette** (Tailwind names): background `slate-50`, cards `white`, text `slate-900` / muted `slate-500`; brand accent **indigo-600**; semantic: Buy now `emerald-600`, Wait `amber-600`, Over budget `slate-400`, Inflated discount `rose-600`, Lowest seen `teal-600`, Demo data banner `violet-600`. Support dark mode via Tailwind `dark:` classes if time allows (nice-to-have).
- **Typography:** Inter; headline 36–44 px semibold; prices use `tabular-nums`.
- **Money:** always `new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })` → "₹11,999". Percentages rounded to whole numbers in UI.
- **Dates:** relative for recency ("2 min ago", "yesterday"), absolute "12 Sep 2026" elsewhere.
- **Motion:** subtle only — 150–200 ms transitions, cards fade/slide in staggered on results; respect `prefers-reduced-motion`.
- **Responsive:** works at 360 px wide with no horizontal scroll; drawer becomes full-screen sheet on mobile.
- **Accessibility:** every input has a label; verdicts use icon + text, never colour alone; visible focus rings; drawer/modal trap focus and close on Esc; loading regions use `aria-live="polite"`; colour contrast AA.

---

## 8. Honesty rules (non-negotiable — this is our core pitch)

1. Never show results without the provenance banner. Seeded/demo data must always be labelled as such.
2. Say **"Inflated discount"** / "discount looks inflated", never "fake" or "scam" in UI copy.
3. Never compute or invent prices, discounts or verdicts in the frontend — display only what the API returns (formatting and rounding are fine).
4. Show the observation window with any "lowest" claim ("Lowest in 45 days", not just "Lowest price").
5. Store links open the store in a new tab; no affiliate tracking, no fake "only 2 left" urgency.

---

## 9. Build order and acceptance checklist

Build in this order; each step should be demoable on its own with `VITE_USE_MOCK=true`.

1. Setup (§3), types (§4.1), `apiFetch` + client (§4.2), mock API (§5).
2. Layout shell + Screen 1.
3. Screen 2 (spec review with editable chips + clarification).
4. Screen 3 cards + provenance banner + summary + filters + progress state.
5. Detail drawer with chart + stats.
6. Digest modal (preview + send, 501 handling).
7. Watches page.
8. Polish: empty/error states, mobile, accessibility, dark mode (optional).

**Done when:**
- [ ] `npm run build` in `web/` succeeds with no TypeScript errors.
- [ ] Full flow works in mock mode: describe → review/edit spec → results → drawer → digest preview.
- [ ] The Scarlett 2i2 card clearly shows "Store says 33% off · Really 12% off" and the drawer chart shows the red "was" line far above the real prices.
- [ ] The "fail" mock shows the amber cached banner with the fallback reason.
- [ ] Every API error shows a friendly message with Retry; a 501 disables the feature instead of crashing.
- [ ] Usable at 360 px width; keyboard-only navigation works.
- [ ] Switching `VITE_USE_MOCK=false` with the backend running on port 8080 works without code changes.

---

## 10. Out of scope for the prototype

Login/accounts, payments, multiple currencies, product images (the API has none — use a neutral category icon), notifications other than email, editing a saved watch (delete and recreate instead), admin pages.
