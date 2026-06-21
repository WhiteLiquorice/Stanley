# Stanley Demo Videos

7 Playwright scripts that record marketing demo videos showing everyday browser automation scenarios. Each script records a single `.webm` file to `demos/output/`. Intended for Instagram organic content and ads.

---

## Prerequisites

From the `Stanley/` root folder:

```bash
npm install   # already done if you've been working in the project
```

Playwright requires browsers to be installed:

```bash
npx playwright install chromium
```

---

## Running a Demo

Each script is standalone. From the `Stanley/` root:

```bash
npx ts-node demos/01-morning-briefing.ts
npx ts-node demos/02-price-tracker.ts
npx ts-node demos/03-job-hunt.ts
npx ts-node demos/04-competitor-pulse.ts
npx ts-node demos/05-review-monitor.ts
npx ts-node demos/06-form-autopilot.ts
npx ts-node demos/07-lead-research.ts
```

Or compile first and run with Node:

```bash
npx tsc && node demos/01-morning-briefing.js
```

Videos are saved to `demos/output/` as `.webm` files, one per run.

---

## The 7 Scenarios

| # | File | Audience | Hook |
|---|------|----------|------|
| 1 | `01-morning-briefing.ts` | Consumer | "I check too many sites before I can start my day" |
| 2 | `02-price-tracker.ts` | Consumer | "I keep checking if the price dropped before I buy" |
| 3 | `03-job-hunt.ts` | Consumer/Prosumer | "I check three job boards every morning" |
| 4 | `04-competitor-pulse.ts` | Prosumer/Business | "I manually check competitor pricing once a week" |
| 5 | `05-review-monitor.ts` | Business | "I check our reviews every morning" |
| 6 | `06-form-autopilot.ts` | Business | "I fill out the same fields every single week" |
| 7 | `07-lead-research.ts` | Prosumer/Business | "I look up the same info on every prospect" |

---

## How each video is structured

**Phase 1 — Stanley popup** (~15–20 seconds)
- The real Stanley extension popup loads in a centered dark viewport
- The prompt is typed character by character (looks like a human typed it)
- Stanley generates a plan — steps appear in the Plan Preview panel
- "Confirm & Run" is clicked

**Phase 2 — Automation** (~20–30 seconds)
- Browser navigates to a pre-seeded local HTML page (controlled data, no live network)
- Playwright highlights extracted elements with green outlines as they're "collected"
- Pacing is deliberate so viewers can follow along

Total raw footage per video: ~40–50 seconds. Trim and add music/caption/VO in DaVinci.

---

## Pre-seeded pages

All automation runs on local HTML files in `demos/pages/`. They look like the real sites but use fixed data so every recording is identical:

| File | Simulates |
|------|-----------|
| `hackernews.html` | Hacker News front page with 10 controlled stories |
| `amazon-product.html` | Amazon product page — Sony WH-1000XM5 at $279.99 |
| `indeed-jobs.html` | Indeed results page — 8 UX Designer remote roles |
| `saas-pricing.html` | Pricing comparison — Monday, Asana, Notion |
| `google-reviews.html` | Google Maps review panel — Blue Bottle Coffee |
| `vendor-form.html` | Professional vendor timesheet form |
| `wikipedia-stripe.html` | Wikipedia article — Stripe, Inc. with infobox |

---

## Editing in DaVinci Resolve

Suggested workflow:
1. Import the `.webm` into DaVinci (Media Pool → Import)
2. Add a hook text card at the start (the "I keep doing X manually" problem statement)
3. Optionally add a split between popup phase and automation phase
4. Add music (lo-fi tech, upbeat minimal)
5. Optionally record a voiceover or add captions
6. Export as MP4 — 1280×800 for landscape Instagram / crop to square for Feed

For Reels (9:16): add letterbox bars top/bottom, or place over a blurred background version of the same frame.
