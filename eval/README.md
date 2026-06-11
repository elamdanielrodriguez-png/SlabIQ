# SlabIQ Eval Harness

Measure how accurately the grading pipeline matches real PSA/BGS outcomes. Drop in cards you've already had professionally graded, run the harness, and the dashboard tells you where the AI agrees with the slab and where it doesn't.

## Quick start

1. **Add a card.** Make a folder under `eval/dataset/` named however you like (lowercase, hyphens — e.g. `mahomes-2017-prizm-base`). Drop the front and back photos in (any `.jpg`/`.jpeg`/`.png`). Create a `truth.json` next to them with the confirmed identity and the real grade. See `dataset/EXAMPLE_CARD/truth.json` for the schema.
2. **Start the SlabIQ server** in another terminal: `npm run server`. The eval hits `http://localhost:3001/api/grade` by default.
3. **Run the eval:** `node eval/run.js`. Each card takes ~20–30s because the server fetches eBay reference images and calls Claude.
4. **Open the dashboard:** double-click `eval/dashboard.html` (it loads `results/latest.js`, no server needed).

## `truth.json` schema

```json
{
  "card": {
    "player": "Patrick Mahomes",
    "year": "2017",
    "set": "Panini Prizm",
    "variant": "Base Rookie",
    "cardNumber": "248"
  },
  "actual": {
    "psa": 9,
    "bgs": {
      "overall": 9.5,
      "centering": 9.5,
      "corners": 9.5,
      "edges": 9.5,
      "surface": 10
    }
  },
  "images": ["front.jpg", "back.jpg"],
  "notes": "Optional"
}
```

`psa` or `bgs` can be `null` if you only got one. The harness skips metrics it has no ground truth for. If `images` is omitted, the runner auto-discovers any image files in the folder.

## What gets measured

**PSA accuracy:** exact-match %, within-±1 %, mean bias (positive = AI over-grades), MAE.

**BGS subgrade breakdown:** for each of `overall`, `centering`, `corners`, `edges`, `surface` — exact %, within-±0.5 %, signed bias, MAE. Bias is the most useful number — if `corners` shows a +0.4 bias the AI is consistently lenient on corners; if `centering` shows -0.5 it's harsh.

**Per-card diff:** every card with predicted vs actual side by side, click to expand for the verdict, full subgrade table, and the raw predicted JSON.

## Caveats / known limitations

- **No client-side centering pipeline.** The browser app runs a canvas-based centering measurement before sending to `/api/grade`; this harness skips that step and lets the AI estimate centering directly. So `bgs.centering` numbers here reflect the AI's vision-only estimate, which is the *first-pass* number a user sees before any manual override. Production accuracy is typically a bit better because the canvas measurement is more precise.
- **No zoom-in zone crops.** Same reason — the browser slices 8 corner/edge crops before the API call. Without them, the AI has to do whole-image inspection. Add them later if accuracy plateaus.
- **eBay market data noise.** Each grading call also pulls eBay comps. That doesn't affect subgrades but does slow each run. Use the `--only` flag to iterate on a single card faster.
- **Costs API credits.** Each card is one Claude grading call (`claude-opus-4-8`) plus a Haiku call for market bucketing.

## CLI flags

```bash
node eval/run.js                    # all cards in dataset/
node eval/run.js --only mahomes     # only folders whose name contains "mahomes"
EVAL_API=http://staging.example.com node eval/run.js   # different server
```

## Folder layout

```
eval/
  dataset/
    EXAMPLE_CARD/        ← template, runner ignores this folder
    mahomes-2017/        ← real card
      truth.json
      front.jpg
      back.jpg
  results/
    run-2026-05-03T....json   ← timestamped archive of every run
    latest.json               ← most recent run (programmatic)
    latest.js                 ← same data, wrapped for the dashboard
  run.js
  dashboard.html
  README.md
```

## Tips for building the dataset

- 20–30 cards is the rough threshold where noise stops dominating and the metrics become interpretable.
- Mix grades — pile of PSA 10s tells you nothing about whether the AI handles a 7. Aim for spread across 7/8/9/10.
- Mix card types: vintage, modern base, Silver Prizm, numbered parallels. The pipeline is sensitive to all of these.
- Use the **same photos** you submitted to PSA/BGS when possible. The harness will reflect what the AI saw, not a different angle.
- Re-run after every prompt or pipeline change. The bias numbers tell you whether you fixed the thing you intended to fix or just shifted the error elsewhere.
