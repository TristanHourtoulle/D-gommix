# Branding — « Le pion couronné »

One drawing, four cuts. Never re-draw a cut by hand; edit the master and
regenerate.

| File | Use |
|------|-----|
| `pion-couronne.svg` | Master, full cut. Source of every PWA icon ≥ 180 px. |
| `pion-couronne-simple.svg` | Simplified cut (3-leaf crown) for ≤ 48 px — favicon. |
| `pion-couronne-mono.svg` | Monochrome ink, transparent background — splash, watermarks. |
| `pion-couronne-quad.svg` | Quadrichrome four-camp variant — festive contexts. |

Rules baked into these files, do not break them:

- **Full bleed, no drawn frame.** iOS and Android apply their own mask; an icon
  that draws its own rounded frame produces a frame inside a frame.
- **80 % maskable safe zone.** The motif is wrapped in `scale(0.86)` about
  (60, 60) so every drawn point stays inside the centred circle of radius 48.
- **The wordmark is styled text, never an image** (`.wordmark` in
  `apps/web/src/app/globals.css`). These files carry the emblem only.

Regenerate the shipped PNG/ICO set with `pnpm --filter @degommix/web icons`.

`legacy/` holds the pre-2026-07 AI-generated raster identity, kept for reference.
