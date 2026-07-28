## Validation Assets

This folder contains the retrospective validation and regression-figure pipeline used for the science fair board.

What it does:
- parses official Manitoba weekly West Nile surveillance tables from `validation/raw/stats*.html`
- downloads archived daily weather from Open-Meteo for the app's regional coordinates
- computes weekly vector-model scores using the same equations as the app
- runs a small automated regression suite for score thresholds, seasonal weights, safety-score safeguards, and notification logic
- exports board-ready SVG figures to `validation/output/figures`

How to run:

```powershell
npm run validate:figures
```

Notes:
- The retrospective figures are honest model-validation graphics.
- They do not invent human usability data.
- If you later run a real participant study, keep those results separate from these automated and retrospective figures.
