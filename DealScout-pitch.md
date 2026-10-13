# DealScout: Watch the need, not the product

**One-liner:** Your buying advisor. Tell DealScout your goal and your budget. It plans what to buy, splits the money, finds every match across stores, tracks prices, and tells you what to buy now, what to wait on, and which discounts are fake.

## The problem
Priya wants an audio interface under ₹15k. Today she checks Amazon, Flipkart and two niche music stores every few days. Price trackers don't help, because they only watch a link she has already picked. And that "40% off" banner is often measured against a price that was inflated last week.

## The solution
1. **Describe it in plain English.** "USB audio interface for home recording, 2 inputs, under ₹15,000."
2. **Gemini builds a watch spec.** Structured output turns the sentence into category, must-haves, nice-to-haves and a budget.
3. **It finds every match.** Google Search grounding discovers products across stores, including ones you didn't know existed.
4. **It tracks daily.** Cloud Scheduler triggers Cloud Run, and prices are stored in Firestore as history.
5. **It checks whether the discount is real.** Each "sale" is compared with the product's actual price history.
6. **You get a short digest by email:**
   - 🟢 **Buy now:** at its lowest in 90 days, with the reason
   - 🟡 **Wait:** a discount that looks fake, or a price that is trending down
   - 📉 **Lowest seen:** the best price so far for each match

## Kit mode: from a goal to a whole shopping list
"I'm starting a podcast and have ₹30,000 total." Gemini plans the list (microphone, audio interface, headphones, boom arm) and splits the budget. Each item goes through the same scout, fit check and fake-discount check. The result is one pick per item, a budget bar, and a real upgrade if money is left over (for example ₹1,712 left buys a headphone upgrade that is at a 60-day low).

## Why it's different
| Price trackers | DealScout |
|---|---|
| Watch one link you already chose | Watches a need and finds the options |
| Show the discount the store claims | Verifies it against real price history |
| Raw price alerts | A buy or wait call, with reasons |

## How it's built
Gemini (structured output + Google Search grounding) · Cloud Run · Cloud Scheduler · Firestore · Firebase email.
Retailers plug in through a single `PriceSource` interface, so official APIs can replace grounded search as it scales.

## Impact
Anyone shopping for a specific need on a budget saves money and stops refreshing tabs. It starts with music gear and extends to electronics, fitness equipment and more.

---

## 90-second demo script
1. **(0:00)** "Priya wants an audio interface under ₹15k and is tired of checking five sites."
2. **(0:10)** Type the request. Show the Gemini-generated watch spec as JSON.
3. **(0:25)** Show the discovered products, including one from a niche store.
4. **(0:40)** Open a product's price history chart. Point out the inflated "was" price and the real baseline.
5. **(0:55)** Trigger the scheduler. Show the digest email arriving.
6. **(1:15)** Close: "Trackers watch products. DealScout watches your need."

## Slide outline
1. Problem: the checking-prices treadmill and fake discounts
2. Solution: one sentence in, one digest out
3. Demo
4. Architecture diagram: Scheduler → Cloud Run → Gemini → Firestore → Email
5. Fake-discount detection: how history beats the banner
6. Roadmap: retailer APIs, more categories, price-drop push alerts

## Likely judge questions
- **How do you avoid scraping problems?** Grounded search for discovery now. The `PriceSource` interface lets official retailer and affiliate APIs replace it.
- **How is "fake discount" defined?** The claimed original price is compared with the median and maximum of the last 30 to 90 days of tracked prices. If the "was" price never actually held, the discount is flagged.
- **What if history is short for a new watch?** Say so in the digest and lower the confidence rather than guess.

---

## Hackathon strategy

**Scope for the demo (build only this):**
- One category: audio interfaces under ₹15k. Hardcode nothing in the agent, but seed the demo with this one.
- Pre-seed 30–60 days of price history in Firestore so the fake-discount check has something to show on day one. Say plainly in the demo that history is seeded and live tracking is running.
- One real end-to-end run: request → watch spec JSON → grounded product list → verdict → email in the inbox.
- Skip auth, multi-user, and retailer APIs. Mention them on the roadmap slide.

**Lead with the three things judges remember:**
1. "Trackers watch a product. DealScout watches a need."
2. A fake discount caught live, with the price-history chart next to the store's banner.
3. The email landing in a real inbox during the demo.

**Show the Google stack explicitly:** a slide or a labeled architecture diagram naming Gemini structured output, Search grounding, Cloud Run, Cloud Scheduler, Firestore and Firebase email.

**Have a fallback:** record the full demo as a video, and cache one grounded-search result in case the live call is slow or rate-limited.

**Build order if time is short:** watch spec → grounded search → Firestore history + verdict → email → scheduler → simple web form.
