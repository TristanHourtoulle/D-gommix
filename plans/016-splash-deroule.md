# Plan 016: Play the « Le déroulé » opening sequence once per session, over the app

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8dae2b6..HEAD -- apps/web/src/app/layout.tsx apps/web/src/app/globals.css apps/web/src/components e2e/helpers.ts e2e/happy-path.spec.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `8dae2b6`, 2026-07-25

## Why this matters

Dégommix opens on a blank parchment while the session check and the first data
query resolve — the app has no identity moment, and the cold start reads as a
stall rather than as an opening. The owner validated a single splash direction,
« Le déroulé »: a 4 600 ms orchestrated sequence where two bronze rods part, a
parchment sheet unrolls edge to edge, DÉGOMMIX engraves itself letter by letter,
the four camp pips light up, two laurel sprigs draw in, and the whole thing
closes on « Salve ! ». It plays **once per session**, over the app (which is
already laid out behind it), so it doubles as the cold-start cover. When this
lands, the first launch of a session has a deliberate, on-brand opening and the
loading gap is spent instead of endured.

## Current state

### Files that matter

- `apps/web/src/app/layout.tsx` — the **root** layout, a server component. It is
  shared by every route group (`(auth)`, `(tabs)`, `lobby/`, `partie/`) and is
  the only place in the app that mounts exactly once per page load and survives
  every client-side navigation. This is where `ToastProvider` was put for that
  exact reason.
- `apps/web/src/app/globals.css` — 1000 lines, single global stylesheet; hosts
  every animation in the app (`hit-*`, `eg-*` sections at the bottom).
- `apps/web/src/components/live/endgame.ts` + `endgame.test.ts` — the exemplar
  for "pure module + node vitest test" that this plan copies.
- `apps/web/src/components/live/summary.tsx` — the exemplar for "CSS-driven
  sequence, class removed at the end, reduced motion read in an effect".
- `apps/web/src/app/manifest.ts` — PWA manifest; `background_color` and
  `theme_color` are both `#ece0c4`.
- `e2e/helpers.ts` + `e2e/happy-path.spec.ts` — the Playwright happy path; it
  creates two browser contexts and starts clicking immediately.

### Root layout as it exists today (`apps/web/src/app/layout.tsx:42-58`)

```tsx
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${cinzel.variable} antialiased`}>
        {/*
          The one and only toaster. It sits above every route group so a toast
          fired right before `router.push()` outlives the navigation instead of
          dying with the layout that owned it (« Invitation envoyée ! » from
          Amis landing in /lobby). `children` stays a server subtree.
        */}
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
```

Note the metadata above it: `appleWebApp.statusBarStyle: 'black-translucent'`,
and **no `startupImage`** is declared. So on iOS the installed PWA's launch
screen falls back to the manifest's `background_color`, which is `#ece0c4`
(`apps/web/src/app/manifest.ts:16-17`, both `theme_color` and
`background_color`). **The splash background must therefore be `#ece0c4`,
hardcoded, in both themes** — see the "Light-only" decision below.

### PWA / launch-screen facts (verified, do not re-investigate)

| Thing | Value | Where |
|---|---|---|
| manifest `background_color` | `#ece0c4` | `apps/web/src/app/manifest.ts:16` |
| manifest `theme_color` | `#ece0c4` | `apps/web/src/app/manifest.ts:15` |
| `viewport.themeColor` light | `#ece0c4` | `apps/web/src/app/layout.tsx:38` |
| `viewport.themeColor` dark | `#1c150d` | `apps/web/src/app/layout.tsx:39` |
| apple `startupImage` | **absent** | `apps/web/src/app/layout.tsx:21-28` |
| app `--parchment` light / dark | `#ece0c4` / `#1c150d` | `globals.css:4` / `globals.css:47` |

### CSS conventions in `globals.css`

Sections are separated by `/* ---------- Title ---------- */`, then a `/** … */`
block comment explaining the *why*, then the rules. Animation families use a
short prefix on **every** class and **every** keyframe name:

- `hit-*` — the dégommage hit FX (`globals.css:692-828`)
- `eg-*` — the end-of-game sequence (`globals.css:830-1000`)

The `eg-*` section's own comment states the design contract this plan reuses
verbatim (`globals.css:832-840`):

```
 * End-of-game sequence — two variants (winner ~3.3 s, loser ~3.05 s) played on
 * the summary screen. Everything is scoped to `.eg-play`: removing that class
 * skips to the final image, because every keyframe ends on the rest state. That
 * is also why reduced motion needs nothing but a blanket `animation: none`.
 *
 * Only `transform` and `opacity` are animated
```

Also existing and reused as-is: `.wordmark` (`globals.css:127-137`) —
`font-family: var(--font-display)`, uppercase, `color: var(--bronze)`,
`-webkit-text-stroke: 1px var(--ink)`, `paint-order: stroke fill`.

Highest `z-index` currently in use is **50** (tab bar `globals.css:591`, toast
stack `toast.tsx:57`, connection banner `connection-banner.tsx:14`). The splash
overlay uses **100**.

Design tokens available (light values, `globals.css:4-16`):
`--parchment #ece0c4`, `--parchment-deep #d9c393`, `--ink #251a10`,
`--bronze #8c5a2b`, `--bronze-strong #6f4620`, and the four camps
`--asterix #b23a2e` (rouge), `--obelix #2c5b82` (bleu), `--caius #b9861f` (or),
`--caligula #3f6b3c` (vert).

### The pure-module + test pattern to copy

`apps/web/src/components/live/endgame.ts` exports named constants and pure
functions with a JSDoc block explaining intent; `endgame.test.ts` is a plain
`vitest` file (`import { describe, expect, it } from 'vitest'`). Vitest config
(`apps/web/vitest.config.ts`) is `environment: 'node'`, `include:
['src/**/*.test.ts']` — **`.test.tsx` files are not picked up**, so the new test
must be a `.ts` file testing a `.ts` module, never the component.

### The reference implementation (owner-validated, inlined)

The source of truth is the proposal artifact's Direction 1 (`.s1` scene). Its
exact CSS is reproduced below — you do **not** need to open the artifact, but if
you want the original it is at
`/private/tmp/claude-501/-Users-tristanhourtoulle--superset-worktrees-c44a0b7e-07e6-44fb-9d63-470bb876c5b7-analyze-specs-characters/c8adab37-493b-45cc-b011-1b55856397ae/scratchpad/artifacts/splash-animations.html`
(lines 317-404 for CSS, 874-908 for DOM). Treat the file as possibly gone; the
excerpts here are authoritative.

Reference CSS (artifact palette: `--velin-creux #d7c69f`, `--parchemin #ece0c4`,
`--bronze #8c5a2b`, `--bronze-clair #b8874e`, `--encre #251a10`):

```css
.s1{background:var(--velin-creux);}
.s1 .sheet{
  position:absolute;left:22px;right:22px;top:70px;bottom:70px;
  background:linear-gradient(180deg,#f2e8d1,var(--parchemin) 45%,#e6d8b8);
  border-left:2px solid rgba(140,90,43,.4);border-right:2px solid rgba(140,90,43,.4);
  box-shadow:inset 0 0 32px rgba(140,90,43,.18);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
  transform-origin:center center;
}
.s1 .rod{
  position:absolute;left:8px;right:8px;height:20px;border-radius:10px;
  background:linear-gradient(180deg,var(--bronze-clair),var(--bronze) 45%,#5f3a17);
  border:2.5px solid var(--encre);
}
.s1 .rod::before,.s1 .rod::after{
  content:"";position:absolute;top:-4px;width:12px;height:23px;border-radius:4px;
  background:var(--bronze);border:2.5px solid var(--encre);
}
.s1 .rod::before{left:-6px;}
.s1 .rod::after{right:-6px;}
.s1 .rod.top{top:52px;}
.s1 .rod.bot{bottom:52px;}
/* Les rameaux encadrent le « Salve ! », jamais le nom : le verrou reste lisible. */
.s1 .laurel{position:absolute;top:350px;width:46px;height:78px;}
.s1 .laurel.l{left:40px;transform:scaleY(-1);}
.s1 .laurel.r{right:40px;transform:scale(-1,-1);}
.s1 .laurel path{fill:none;stroke:var(--bronze);stroke-width:3.5;stroke-linecap:round;}
.s1 .laurel ellipse{fill:var(--vert);stroke:var(--encre);stroke-width:2;transform-origin:center;}
.s1 .mark{font-size:30px;text-align:center;}
.s1 .sub{
  font-family:var(--display);text-transform:uppercase;letter-spacing:.3em;
  font-size:10px;color:var(--bronze);margin:0;
}
.s1 .pips{display:flex;gap:12px;}
.s1 .pip{
  width:30px;height:34px;background:var(--c);border:2.5px solid var(--encre);
  border-radius:6px 6px 50% 50%/6px 6px 60% 60%;
  box-shadow:inset 0 -4px 0 rgba(37,26,16,.22);
}
.s1 .salve{
  font-family:var(--display);text-transform:uppercase;letter-spacing:.22em;
  font-size:17px;margin:0;color:var(--encre);
}
.s1 .hr{width:120px;height:2.5px;background:var(--bronze);border-radius:2px;}

.s1.is-playing .sheet{animation:k1unroll 1500ms cubic-bezier(.22,.85,.3,1) both;}
.s1.is-playing .rod.top{animation:k1rodTop 1500ms cubic-bezier(.22,.85,.3,1) both;}
.s1.is-playing .rod.bot{animation:k1rodBot 1500ms cubic-bezier(.22,.85,.3,1) both;}
.s1.is-playing .mark span{animation:k1engrave 420ms cubic-bezier(.3,1.3,.4,1) both;
  animation-delay:calc(1620ms + var(--i) * 95ms);}
.s1.is-playing .hr{animation:k1hr 500ms ease-out 2500ms both;}
.s1.is-playing .sub{animation:k1fade 500ms ease-out 2650ms both;}
.s1.is-playing .pip{animation:k1pip 480ms cubic-bezier(.25,1.5,.4,1) both;
  animation-delay:calc(2700ms + var(--i) * 170ms);}
.s1.is-playing .laurel path{animation:k1draw 1000ms ease-out 3100ms both;}
.s1.is-playing .laurel ellipse{animation:k1leaf 300ms cubic-bezier(.3,1.6,.4,1) both;
  animation-delay:calc(3300ms + var(--i) * 90ms);}
.s1.is-playing .salve{animation:k1salve 700ms cubic-bezier(.2,1.2,.35,1) 4000ms both;}

@keyframes k1unroll{
  0%{transform:scaleX(.06) scaleY(.012);opacity:0;}
  8%{opacity:1;}
  32%{transform:scaleX(1) scaleY(.012);}
  100%{transform:scaleX(1) scaleY(1);}
}
@keyframes k1rodTop{0%,32%{transform:translateY(275px);}100%{transform:translateY(0);}}
@keyframes k1rodBot{0%,32%{transform:translateY(-275px);}100%{transform:translateY(0);}}
@keyframes k1engrave{
  0%{opacity:0;transform:translateY(9px) scale(1.25);filter:blur(1px);}
  60%{opacity:1;filter:blur(0);}
  100%{opacity:1;transform:translateY(0) scale(1);}
}
@keyframes k1hr{from{transform:scaleX(0);}to{transform:scaleX(1);}}
@keyframes k1fade{from{opacity:0;}to{opacity:1;}}
@keyframes k1pip{
  0%{opacity:0;transform:translateY(14px) scale(.5);}
  55%{opacity:1;transform:translateY(-4px) scale(1.14);}
  100%{opacity:1;transform:translateY(0) scale(1);}
}
@keyframes k1draw{from{stroke-dashoffset:210;}to{stroke-dashoffset:0;}}
@keyframes k1leaf{from{opacity:0;transform:scale(.2);}to{opacity:1;transform:scale(1);}}
@keyframes k1salve{
  0%{opacity:0;transform:translateY(16px) scale(.86);letter-spacing:.6em;}
  100%{opacity:1;transform:translateY(0) scale(1);letter-spacing:.22em;}
}
```

Reference DOM (`.s1`, artifact lines 874-908):

```html
<div class="scene s1" data-scene data-total="4600">
  <div class="rod top"></div>
  <div class="rod bot"></div>
  <div class="sheet">
    <svg class="laurel l" viewBox="0 0 74 118" aria-hidden="true">
      <path d="M62 8 C40 32 30 62 32 110" style="stroke-dasharray:210"/>
      <ellipse style="--i:0" cx="49" cy="26" rx="11" ry="6" transform="rotate(-32 49 26)"/>
      <ellipse style="--i:1" cx="41" cy="47" rx="11" ry="6" transform="rotate(-22 41 47)"/>
      <ellipse style="--i:2" cx="35" cy="68" rx="11" ry="6" transform="rotate(-12 35 68)"/>
      <ellipse style="--i:3" cx="32" cy="88" rx="10" ry="5.5" transform="rotate(-4 32 88)"/>
      <ellipse style="--i:4" cx="31" cy="105" rx="8" ry="4.5"/>
    </svg>
    <svg class="laurel r" viewBox="0 0 74 118" aria-hidden="true"> … same 5 ellipses … </svg>
    <h3 class="wordmark mark">
      <span style="--i:0">D</span><span style="--i:1">É</span><span style="--i:2">G</span>
      <span style="--i:3">O</span><span style="--i:4">M</span><span style="--i:5">M</span>
      <span style="--i:6">I</span><span style="--i:7">X</span>
    </h3>
    <div class="hr"></div>
    <p class="sub">Le Village des quatre camps</p>
    <div class="pips">
      <div class="pip" style="--c:var(--rouge);--i:0"></div>
      <div class="pip" style="--c:var(--bleu);--i:1"></div>
      <div class="pip" style="--c:var(--or);--i:2"></div>
      <div class="pip" style="--c:var(--vert);--i:3"></div>
    </div>
    <p class="salve">Salve !</p>
  </div>
</div>
```

### Validated phase table (owner-approved, keep exactly)

| ms | Phase | What happens |
|---|---|---|
| 0 → 1 500 | Déroulement | Rods travel to the centre, the sheet stretches in width then opens in height to the edges |
| 1 620 → 2 405 | Gravure | The 8 letters of DÉGOMMIX cascade at 95 ms, 420 ms each |
| 2 500 → 3 180 | Les quatre camps | The bronze rule stretches, the subtitle fades in, the 4 pips pop at 170 ms |
| 3 100 → 3 960 | Lauriers | Stems trace with `stroke-dashoffset`, leaves hatch staggered at 90 ms |
| 4 000 → 4 600 | Salve | The word rises, the tracking tightens, the sheet settles |

## Locked integration rules (owner-approved — do not renegotiate)

1. **Once per session**, at the first mount of the app shell.
2. Rendered **over the app**, as a fixed overlay. The app is already laid out
   behind it → **zero layout shift** when it unmounts.
3. Guard = a `sessionStorage` flag, key `degommix.splash.seen`, read and written
   **client-side only**.
4. It **covers the cold-start data loading**. If data is ready earlier, the
   sequence still finishes; it **never extends beyond 4 600 ms**.
5. **Tap anywhere = jump to the final image, then unmount.** Pointer events are
   captured only while it is mounted.
6. `prefers-reduced-motion: reduce` → the sequence **never mounts**. There is no
   shortened variant.
7. Background `#ece0c4`, continuous with the iOS launch screen.
8. French copy, exactly: `Le Village des quatre camps` and `Salve !`.
9. The 1 800 ms short variant is **out of scope**.

## Decisions taken for you (do not re-litigate)

**D1 — Mounting strategy: a client `<SplashGate />` mounted as a *sibling* of
`ToastProvider` in the ROOT layout.**
The root layout is the only node shared by `(auth)`, `(tabs)`, `lobby/` and
`partie/`; it renders once per document load and survives every client-side
navigation. A sibling (not a wrapper) keeps `children` a server subtree and
guarantees the app tree never re-renders because of the splash.

**D2 — No hydration mismatch, no flash on repeat navigation.**
`SplashGate`'s **initial render returns `null`**. The mount decision happens in
a `useEffect` (post-hydration), which reads `sessionStorage` + `matchMedia` and
only then flips state to visible. Server HTML and first client render are
therefore identical (nothing), so React can never warn, and a repeat navigation
does not remount `SplashGate` at all (it lives above the route groups). A hard
reload does remount it — but the `sessionStorage` flag is already set, so it
stays `null`. The flag is written **when the sequence starts**, not when it
ends, so a reload mid-splash does not replay it.

**D3 — It plays on `/login` too, for a logged-out user. Recommended: YES.**
This is the *app opening*, not the *home screen* opening. A logged-out cold
start is still a cold start, and `(auth)` shares the root layout, so the
alternative would mean route-sniffing inside a layout that has no business
knowing routes. Keeping it unconditional also means the e2e happy path (which
starts at `/login`) exercises the real production path.

**D4 — The splash is light-only, with hardcoded hex values.**
It must be continuous with the iOS launch screen, which is the manifest's
`background_color: #ece0c4` — a fixed value that does not follow the app theme.
It is also the artifact's own explicit decision: the four camp colours only hold
their contrast on light parchment. So the `sp-*` rules **must not** use
`var(--parchment)` / `var(--ink)` / `var(--asterix)` etc. (they flip in dark
mode). Use the literal light-theme hexes, with a comment saying why.

**D5 — Exit: a 240 ms fade that lives *inside* the 4 600 ms budget.**
Unmount happens at exactly `SPLASH_TOTAL_MS = 4600`. The overlay gets an
`sp-out` opacity fade over the last 240 ms (4 360 → 4 600) so the cut to the app
is not a hard flash — this matters because in dark theme the app behind is
`#1c150d`. On tap-to-skip: drop `is-playing` (snap to the final image, exactly
like `.eg-play` does), then run the same 240 ms fade, then unmount. That is
literally rule 5: "jump to final image then unmount".

**D6 — e2e: the Playwright context sets the flag via an init script.**
Not a `navigator.webdriver` backdoor in production code (a test-only branch in
shipped code is a smell and would silently disable the splash for any automated
browser a real user might run). Instead, `e2e/helpers.ts` gains a
`newAppContext(browser)` helper that creates the context **and** installs
`context.addInitScript(() => sessionStorage.setItem('degommix.splash.seen','1'))`.
`addInitScript` runs at document start on every page and navigation of that
context, so the flag is present before React hydrates and `shouldShowSplash`
returns `false`. `storageState` cannot be used — it persists `localStorage`
only, never `sessionStorage`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0, no errors |
| Lint | `pnpm lint` | exit 0 |
| Unit tests (web only) | `pnpm --filter @degommix/web test` | all pass |
| Full test suite | `pnpm exec turbo run test --concurrency=1` | all pass (needs Postgres, below) |
| Postgres for tests/dev | `docker compose -f docker-compose.test.yml up -d` | container healthy on port 54329 |
| Migrations | `DATABASE_URL=postgres://degommix:degommix@localhost:54329/degommix_test pnpm --filter @degommix/db db:migrate` | exit 0 |
| Dev stack | `cp .env.example apps/web/.env.local` then `pnpm dev` | Next on `http://localhost:3000`, ws-server on `:4001` |
| E2E | `pnpm test:e2e` | 1 passed |

## Suggested executor toolkit

- Use the `playwright` skill (or the `chrome-devtools` MCP tools) for the visual
  verification in Step 6 — you need timed screenshots, which the CLI wrapper
  does well.
- Use `superpowers:verification-before-completion` before claiming done: every
  claim in "Done criteria" must be backed by pasted command output.
- Do **not** reach for an animation library. The whole sequence is CSS
  `transform` / `opacity` / `stroke-dashoffset`, exactly like the `eg-*` family.

## Scope

**In scope** (the only files you may modify or create):

- `apps/web/src/components/splash/splash-gate.ts` (create) — pure module
- `apps/web/src/components/splash/splash-gate.test.ts` (create) — vitest, node
- `apps/web/src/components/splash/splash-overlay.tsx` (create) — client component
- `apps/web/src/app/globals.css` (edit — append one `sp-*` section at the end)
- `apps/web/src/app/layout.tsx` (edit — one import + one JSX line)
- `e2e/helpers.ts` (edit — add `newAppContext`)
- `e2e/happy-path.spec.ts` (edit — 2 lines, use `newAppContext`)
- `plans/README.md` (edit — status row)

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/app/manifest.ts` and the `metadata` / `viewport` exports in
  `layout.tsx` — the colours already line up (`#ece0c4` everywhere on the light
  side); adding `startupImage` is a separate, asset-generating job.
- `apps/web/src/app/(tabs)/layout.tsx`, `(auth)/layout.tsx` — the splash must be
  above route groups; putting it in a group layout would replay it on every
  crossing.
- The `eg-*` and `hit-*` CSS sections — do not refactor them to share keyframes
  with `sp-*`. They are three independent, self-contained sequences on purpose;
  coupling them makes every future tweak a three-screen regression risk.
- Any shortened / reduced-motion *variant* of the sequence. Rule 6 is
  all-or-nothing.
- `apps/web/src/app/dev/ui/` — plan 014 (dev animations menu) is a separate,
  still-TODO plan. Do not pre-wire the splash into it.

## Git workflow

- Branch: `feat/016-splash-deroule` off `main`.
- Conventional commits, matching the repo's log, e.g.
  `feat(web): once-per-session « Le déroulé » opening sequence`.
- Commit per logical unit (gate module + tests / CSS / component + mount / e2e).
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the pure splash-gate module

Create `apps/web/src/components/splash/splash-gate.ts`. It holds every timing
constant and the single decision function. It must import nothing and touch no
browser global — that is what makes it testable in the `node` vitest
environment.

Target shape:

```ts
/**
 * Pure inputs of the opening sequence (« Le déroulé »). Kept free of every
 * browser global so the decision is unit-testable and so the component can read
 * `sessionStorage` / `matchMedia` in an effect — never during render, which
 * would desync SSR from hydration.
 */

/** Session flag: the sequence plays once per browser session, per tab. */
export const SPLASH_SEEN_KEY = 'degommix.splash.seen'

/** The value written under `SPLASH_SEEN_KEY`. Any other value replays it. */
export const SPLASH_SEEN_VALUE = '1'

/**
 * Owner-validated total. The sequence never runs longer, even when the app's
 * cold-start data is still loading behind it — and never gets cut short when
 * the data arrives early.
 */
export const SPLASH_TOTAL_MS = 4600

/** Fade-out of the overlay itself, taken *inside* SPLASH_TOTAL_MS. */
export const SPLASH_FADE_MS = 240

export interface SplashGateInput {
  /** Raw value read from `sessionStorage`, or `null` when absent/blocked. */
  readonly seenFlag: string | null
  /** `(prefers-reduced-motion: reduce)` at mount time. */
  readonly prefersReducedMotion: boolean
}

/**
 * Reduced motion wins over everything: there is no shortened variant, the
 * sequence simply never mounts. Otherwise it plays exactly once per session.
 */
export function shouldShowSplash({ seenFlag, prefersReducedMotion }: SplashGateInput): boolean {
  if (prefersReducedMotion) return false
  return seenFlag !== SPLASH_SEEN_VALUE
}
```

**Verify**: `grep -n "SPLASH_TOTAL_MS = 4600" apps/web/src/components/splash/splash-gate.ts`
→ one match. `grep -cn "window\|document\|sessionStorage\." apps/web/src/components/splash/splash-gate.ts`
→ `0` (the key *name* string contains none of those tokens).

### Step 2: Test the gate module

Create `apps/web/src/components/splash/splash-gate.test.ts`, modelled on
`apps/web/src/components/live/endgame.test.ts` (same imports, same
`describe`/`it` French-flavoured naming). Cover, at minimum:

1. shows when the flag is absent and motion is allowed → `true`
2. hides when the flag equals `'1'` → `false`
3. hides under reduced motion even with no flag → `false`
4. hides under reduced motion **and** a flag → `false`
5. shows when the flag holds an unrelated/stale value (`'true'`, `''`) → `true`
   (guards against a future value change silently suppressing the splash)
6. `SPLASH_TOTAL_MS` is exactly `4600` and `SPLASH_FADE_MS < SPLASH_TOTAL_MS`
   (locks the owner-validated budget against drift)

**Verify**: `pnpm --filter @degommix/web test -- splash-gate` → all pass, at
least 6 assertions across the file, exit 0.

### Step 3: Add the `sp-*` section to `globals.css`

Append a new section at the **end** of `apps/web/src/app/globals.css`, after the
`eg-*` block. Follow the house format: a `/* ---------- … ---------- */` rule,
then a `/** … */` comment explaining the two non-obvious decisions (light-only
palette for launch-screen continuity; `is-playing` removal snaps to the final
image), then the rules.

Adapt the reference CSS with these mechanical substitutions:

| Reference | Here |
|---|---|
| `.s1` | `.sp-root` |
| `.s1 .sheet` | `.sp-sheet` |
| `.s1 .rod` | `.sp-rod` |
| `.s1 .laurel` | `.sp-laurel` |
| `.s1 .mark` | `.sp-mark` |
| `.s1 .sub` | `.sp-sub` |
| `.s1 .pips` / `.pip` | `.sp-pips` / `.sp-pip` |
| `.s1 .salve` | `.sp-salve` |
| `.s1 .hr` | `.sp-rule` |
| `.s1.is-playing X` | `.sp-root.is-playing X` |
| `@keyframes k1unroll` … | `@keyframes sp-unroll`, `sp-rod-top`, `sp-rod-bot`, `sp-engrave`, `sp-rule-grow`, `sp-fade`, `sp-pip`, `sp-draw`, `sp-leaf`, `sp-salve` |

Required adaptations beyond renaming — each one matters:

1. **`.sp-root` is the overlay**, not a 330×714 demo phone:
   ```css
   .sp-root {
     position: fixed;
     inset: 0;
     z-index: 100;               /* above the tab bar / toasts / banner, all at 50 */
     overflow: hidden;
     background: #d7c69f;        /* the artifact's « velin creux », light-only */
     opacity: 1;
   }
   .sp-root.sp-out { opacity: 0; transition: opacity 240ms ease-out; }
   ```
2. **Hardcode the light palette.** Do not use `var(--parchment)`, `var(--ink)`,
   `var(--bronze)`, `var(--asterix)`… anywhere in the `sp-*` section — they
   invert under `[data-theme='dark']`. Use `#ece0c4`, `#251a10`, `#8c5a2b`,
   `#b8874e`, `#b23a2e`, `#2c5b82`, `#b9861f`, `#3f6b3c`. The one exception is
   `font-family: var(--font-display)` on `.sp-mark` / `.sp-sub` / `.sp-salve`
   (the Cinzel face is theme-independent) — or simply keep the shared
   `.wordmark` class on the mark element, which already sets it.
3. **The sheet's fixed insets become responsive.** The reference hardcodes
   `left:22px; right:22px; top:70px; bottom:70px` for a 330×714 frame. Use
   `left: 6vw; right: 6vw; top: calc(8dvh + env(safe-area-inset-top)); bottom:
   calc(8dvh + env(safe-area-inset-bottom))`, and the rods at
   `top: calc(6dvh + env(safe-area-inset-top))` / `bottom: calc(6dvh +
   env(safe-area-inset-bottom))`. The rods' `translateY(±275px)` start values
   must be large enough to meet at the centre on a tall phone — replace them
   with `translateY(45dvh)` / `translateY(-45dvh)`.
4. **The laurels are positioned relative to the salve, not at `top:350px`.**
   Keep the artifact's intent, quoted verbatim in the reference:
   *« Les rameaux encadrent le "Salve !", jamais le nom : le verrou reste
   lisible. »* Put them at `bottom: 14dvh; left: 10vw` / `right: 10vw` inside
   `.sp-sheet` and verify visually in Step 6 that they frame « Salve ! » and do
   not overlap DÉGOMMIX.
5. **Keep `stroke-dasharray: 210` on the laurel path** (it pairs with
   `@keyframes sp-draw { from { stroke-dashoffset: 210 } to { … 0 } }`).
6. **Reduced motion**: append the blanket neutraliser, mirroring the `eg-*`
   precedent, as a defence in depth (the component already refuses to mount):
   ```css
   @media (prefers-reduced-motion: reduce) {
     .sp-root, .sp-root *, .sp-root *::before, .sp-root *::after { animation: none !important; }
   }
   ```
7. **`will-change: transform, opacity`** on `.sp-sheet`, `.sp-mark span`,
   `.sp-pip` — same as `.eg-anim` does.

**Verify**:
- `grep -c "sp-" apps/web/src/app/globals.css` → ≥ 30
- `grep -n "k1\|\.s1" apps/web/src/app/globals.css` → **no matches** (nothing
  from the demo's namespace leaked in)
- `grep -n "sp-" apps/web/src/app/globals.css | grep -E "var\(--(parchment|ink|bronze|asterix|obelix|caius|caligula|surface)" ` → **no matches** (D4 respected)
- `pnpm lint` → exit 0

### Step 4: Build the overlay component

Create `apps/web/src/components/splash/splash-overlay.tsx`, `'use client'`.

It exports two things:

**`SplashOverlay`** — presentational, takes `{ playing, onDismiss }`:

- Root `<div className={playing ? 'sp-root is-playing' : 'sp-root'}>`.
- Inside: `<div className="sp-rod top" aria-hidden="true" />`,
  `<div className="sp-rod bot" aria-hidden="true" />`, then `<div
  className="sp-sheet">` containing, in the reference's order: the two laurel
  SVGs, the mark, the rule, the subtitle, the pips, the salve.
- The mark: `<p className="wordmark sp-mark" aria-hidden="true">` with the 8
  letters `D É G O M M I X` each in `<span style={{ '--i': index } as
  CSSProperties}>`. Derive them from a `const WORDMARK = 'DÉGOMMIX'` split into
  an array so no index drifts — but **beware**: `'DÉGOMMIX'.split('')` is safe
  here (É is BMP, single code unit) — still, prefer `Array.from(WORDMARK)`.
- The pips: map over
  `[['#b23a2e','Astérix'],['#2c5b82','Obélix'],['#b9861f','Caius'],['#3f6b3c','Caligula']]`
  emitting `<span className="sp-pip" style={{ '--c': color, '--i': index }} />`.
  Colours hardcoded per D4.
- The laurels: one small local `SplashLaurel({ side })` component holding the
  reference `<path d="M62 8 C40 32 30 62 32 110" style={{ strokeDasharray: 210 }} />`
  and the five `<ellipse>` elements with their `--i` values, exactly as in the
  reference DOM. Model the code shape on
  `apps/web/src/components/live/endgame-decor.tsx:44-73` (`EndgameLaurel`).
- **Accessibility + tap-to-skip in one element**: the whole overlay's interior
  is `aria-hidden="true"`, and a single full-bleed transparent button carries
  both the click target and the accessible name:
  ```tsx
  <button
    type="button"
    className="sp-skip"
    onClick={onDismiss}
    aria-label="Passer l'animation d'ouverture"
  />
  ```
  with `.sp-skip { position: absolute; inset: 0; z-index: 2; background: none;
  border: 0; cursor: pointer; }` added in the Step 3 CSS section. This gives
  tap-anywhere, keyboard (Enter/Space), and a screen-reader escape, with no
  extra key handler.

**`SplashGate`** — the mount decision. Target shape:

```tsx
export function SplashGate() {
  const [phase, setPhase] = useState<'idle' | 'playing' | 'leaving'>('idle')

  // The decision is taken post-hydration, on purpose: the first client render
  // must be byte-identical to the server's (nothing at all), otherwise React
  // warns and the overlay flashes on every hydration. Reading sessionStorage or
  // matchMedia during render would break exactly that.
  useEffect(() => {
    let seenFlag: string | null = null
    try {
      seenFlag = window.sessionStorage.getItem(SPLASH_SEEN_KEY)
    } catch {
      // Storage blocked (private mode, embedded webview): treat as unseen —
      // the splash is decorative, never a gate on anything.
    }
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!shouldShowSplash({ seenFlag, prefersReducedMotion })) return

    try {
      window.sessionStorage.setItem(SPLASH_SEEN_KEY, SPLASH_SEEN_VALUE)
    } catch {
      // Same: a session that cannot remember replays it. Acceptable.
    }
    setPhase('playing')
  }, [])
  …
}
```

Then two timers, both cleaned up on unmount:

- `playing` → `leaving` at `SPLASH_TOTAL_MS - SPLASH_FADE_MS` (4 360 ms)
- `leaving` → `idle` (unmount) at `SPLASH_FADE_MS` (240 ms)

`onDismiss` sets `phase` to `'leaving'` immediately — dropping `is-playing`
snaps every element to its rest state, which *is* the final image (every
keyframe ends there), then the same 240 ms fade runs. Guard `onDismiss` so it is
a no-op when `phase !== 'playing'`.

Render `null` when `phase === 'idle'`; otherwise
`<SplashOverlay playing={phase === 'playing'} onDismiss={dismiss} />` with the
`sp-out` class applied on the root when `phase === 'leaving'`.

**Verify**:
- `pnpm typecheck` → exit 0
- `pnpm lint` → exit 0
- `grep -n "useState" apps/web/src/components/splash/splash-overlay.tsx | head -1`
  shows the initial state is `'idle'` (never `'playing'`), i.e. the first render
  is `null`.
- `grep -n "sessionStorage" apps/web/src/components/splash/splash-overlay.tsx`
  → every occurrence is inside the `useEffect`, none at module or render scope.

### Step 5: Mount it in the root layout

Edit `apps/web/src/app/layout.tsx`: add the import and one JSX line **after**
`</ToastProvider>`, as a sibling:

```tsx
        <ToastProvider>{children}</ToastProvider>
        {/*
          The opening sequence (« Le déroulé »), once per session. It lives here
          — above every route group — for two reasons: this is the only node
          that mounts once per document and survives client-side navigation
          (so it cannot replay when crossing (auth) → (tabs)), and rendering it
          as a sibling keeps `children` a server subtree. It renders nothing
          until an effect has read sessionStorage, so there is no hydration
          mismatch and no flash. It deliberately also plays on /login: this is
          the app opening, not the home screen's.
        */}
        <SplashGate />
```

**Verify**:
- `grep -n "SplashGate" apps/web/src/app/layout.tsx` → 2 matches (import + JSX)
- `grep -rn "SplashGate" "apps/web/src/app/(tabs)/layout.tsx" "apps/web/src/app/(auth)/layout.tsx"`
  → no matches
- `pnpm typecheck && pnpm lint` → exit 0

### Step 6: Verify visually, at the phases

Bring up the stack:

```bash
docker compose -f docker-compose.test.yml up -d
cp .env.example apps/web/.env.local
export DATABASE_URL=postgres://degommix:degommix@localhost:54329/degommix_test
pnpm --filter @degommix/db db:migrate
pnpm dev            # Next on :3000, ws-server on :4001
```

Then, with Playwright (or the chrome-devtools MCP), in a **fresh** context with
a 390×844 viewport and `deviceScaleFactor: 2` (matching
`e2e/playwright.config.ts`), navigate to `http://localhost:3000/login` and take
screenshots at **600 ms, 2 000 ms, 3 000 ms, 3 700 ms and 4 400 ms** after
`goto`. Name them `splash-01-unroll` … `splash-05-salve`.

Confirm, screenshot by screenshot:

1. **600 ms** — the sheet is a horizontal band (unrolled in width, not yet in
   height); rods visible and converging.
2. **2 000 ms** — the sheet is fully open; roughly the first 4-5 letters of
   DÉGOMMIX are engraved, the later ones absent.
3. **3 000 ms** — the full wordmark, the bronze rule, « Le Village des quatre
   camps », and 1-2 pips lit.
4. **3 700 ms** — all four pips (rouge, bleu, or, vert, in that order), laurel
   stems traced, leaves appearing.
5. **4 400 ms** — « Salve ! » in place, framed by the two laurels, **not**
   overlapping the wordmark.

Then three behavioural checks:

- **Once per session**: reload the page in the same context → no splash. Open a
  fresh context → splash again.
- **Tap to skip**: fresh context, tap at ~1 500 ms → the final image appears
  instantly, then the overlay fades and the app underneath is fully interactive.
  Take `splash-06-skip`.
- **Reduced motion**: fresh context created with
  `{ reducedMotion: 'reduce' }` → **no overlay at all**, at any moment. Take
  `splash-07-reduced` and confirm the login form is visible from the first
  frame.
- **No layout shift**: with the splash mounted, the page behind must already be
  at its final layout. Check that `document.querySelector('.sp-root')` is
  `position: fixed` and that the login form's bounding box is identical before
  and after the overlay unmounts (`getBoundingClientRect()` at 1 000 ms vs
  5 000 ms → same `top`/`height`).

**Verify**: all 7 screenshots exist, all five phase descriptions match, and the
bounding-box comparison is identical. Paste the two rects in your report.

### Step 7: Keep the e2e happy path green

Edit `e2e/helpers.ts`, adding:

```ts
/**
 * A browser context with the opening sequence already marked as seen. The
 * splash covers the whole viewport for up to 4.6 s on a fresh session, which
 * would swallow the first clicks of every spec. Setting the flag from the test
 * side (rather than adding a `navigator.webdriver` escape hatch to the app)
 * keeps production code free of test-only branches.
 */
export async function newAppContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    try {
      window.sessionStorage.setItem('degommix.splash.seen', '1')
    } catch {
      /* storage blocked: the splash is harmless anyway */
    }
  })
  return context
}
```

Import `type Browser, type BrowserContext` from `@playwright/test`. The literal
`'degommix.splash.seen'` is intentionally duplicated here — `addInitScript`
serialises the function to the browser, so it cannot close over an imported
constant, and `e2e/` does not depend on `@degommix/web`. Add a one-line comment
saying so, and note the app-side constant's path.

Then edit `e2e/happy-path.spec.ts:12-13`:

```ts
    c1 = await newAppContext(browser)
    c2 = await newAppContext(browser)
```

and add `newAppContext` to the existing `./helpers` import on line 2.

**Verify**:
- `grep -n "browser.newContext()" e2e/happy-path.spec.ts` → **no matches**
- `grep -c "newAppContext" e2e/happy-path.spec.ts` → 3 (import + two calls)
- `pnpm test:e2e` → `1 passed`. Note the wall-clock duration and compare it with
  a pre-change run if you have one; it must not grow by ~4.6 s per context.

### Step 8: Update the plan index

`plans/README.md` already carries a row for 016, currently `TODO`. Flip its
status column. Fill it honestly: `DONE` only once Step 6 **and** Step 7 both
passed; otherwise `BLOCKED (<one-line reason>)`.

**Verify**: `grep -n "^| 016" plans/README.md` → one match, no longer `TODO`.

## Test plan

- **New unit tests**: `apps/web/src/components/splash/splash-gate.test.ts`,
  6 cases as enumerated in Step 2 (flag absent, flag set, reduced motion alone,
  reduced motion + flag, stale flag value, timing constants). Structural model:
  `apps/web/src/components/live/endgame.test.ts`.
- **No component test.** Vitest here is `environment: 'node'` and matches only
  `src/**/*.test.ts`; there is no jsdom, no Testing Library, and this plan does
  not add test infrastructure. The component is covered by the visual pass
  (Step 6) and by the e2e run (Step 7), which proves the overlay does not block
  the app.
- **Existing suites must stay green**: `pnpm exec turbo run test --concurrency=1`
  (Postgres up) and `pnpm test:e2e`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm --filter @degommix/web test` exits 0, with ≥ 6 new `splash-gate` assertions
- [ ] `pnpm exec turbo run test --concurrency=1` exits 0
- [ ] `pnpm test:e2e` → `1 passed`
- [ ] `grep -n "k1\|\.s1" apps/web/src/app/globals.css` → no matches
- [ ] `grep -n "sp-" apps/web/src/app/globals.css | grep -E "var\(--(parchment|ink|bronze|asterix|obelix|caius|caligula|surface)"` → no matches
- [ ] `grep -rn "navigator.webdriver" apps/web/src` → no matches
- [ ] `grep -n "browser.newContext()" e2e/happy-path.spec.ts` → no matches
- [ ] `grep -rn "SPLASH_TOTAL_MS = 4600" apps/web/src/components/splash/splash-gate.ts` → one match
- [ ] `grep -rn "SplashGate" apps/web/src/app` → matches only in `layout.tsx` (2)
- [ ] 7 screenshots from Step 6 exist and match their described phase
- [ ] The login form's `getBoundingClientRect()` is identical with and without the overlay
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` row 016 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts —
  in particular if `apps/web/src/app/layout.tsx` no longer mounts `ToastProvider`
  as the single child of `<body>`, or if a `sp-*` / splash implementation
  already exists.
- React logs a hydration mismatch warning on any page after Step 5. That means
  the mount decision leaked out of the effect; the fix is architectural, not
  cosmetic — report it.
- `pnpm test:e2e` fails **or** its wall-clock time grows by more than ~2 s.
  Either means the init script is not landing before hydration; do not "fix" it
  by adding a `navigator.webdriver` branch to app code (explicitly rejected in
  D6) — report instead.
- The splash reappears when navigating `/login` → `/` → `/amis` in the same tab.
  That means `SplashGate` is remounting, i.e. it is not actually above the route
  groups — report rather than adding a module-level `let hasPlayed` flag.
- On a real phone or in the iOS simulator, a visible colour seam appears between
  the OS launch screen and the splash. Report the two colours you measured; do
  not start editing `manifest.ts` (out of scope).
- The laurels overlap the DÉGOMMIX wordmark at any responsive size you test.
  Adjust their `bottom` / `left` / `right` once; if that does not resolve it at
  both 375×667 and 430×932, report — the artifact's intent (« les rameaux
  encadrent le "Salve !", jamais le nom ») is owner-locked and takes priority
  over the exact reference offsets.
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **The 1 800 ms short variant is a deliberate future option, not an
  omission.** The owner validated only « Le déroulé » at 4 600 ms. If daily
  users start reporting the opening as long, the cheapest move is a second set
  of delays behind a `.sp-root.short` class reusing the same keyframes — not a
  new sequence. Do not add it speculatively.
- **`SPLASH_TOTAL_MS` and the CSS delays are two copies of the same clock.**
  The test in Step 2 pins the TS side; nothing pins the CSS side. Anyone
  retiming a phase must edit both, and the unit test is what will scream.
- **`sp-*` is hardcoded light on purpose** (D4). A future "make the splash
  theme-aware" request must first change the PWA `background_color`, otherwise
  it reintroduces the launch-screen seam this plan closes.
- **What a reviewer should scrutinise in the PR**: (1) that `SplashGate`'s
  first render is `null` and the decision truly lives in an effect — that single
  property is what prevents both the hydration warning and the repeat-navigation
  flash; (2) that nothing test-related leaked into `apps/web/src`; (3) that the
  overlay is `position: fixed` and therefore cannot shift the app's layout.
- **Interaction with plan 014** (hidden dev animations menu, still TODO): when
  014 lands it will want to replay this sequence on demand. The clean seam is
  already there — export `SplashOverlay` separately from `SplashGate`, so 014
  can drive `playing` itself without touching the session flag. Do not wire it
  now.
- **Interaction with any future route-level loading UI**: the splash covers the
  first 4.6 s of a cold start. If a skeleton/`loading.tsx` is added later,
  check they do not fight — the splash is on top and the skeleton simply plays
  underneath, which is the intended behaviour.
