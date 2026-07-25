# Plan 014: Hidden dev menu — long-press the profile avatar to open an animations playground

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, add (or update) the status row for this
> plan in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index. Note: at the time of writing, `plans/README.md` on `main`
> only lists 001–009; rows for 010–014 are landing through separate PRs, so
> **append** your row rather than expecting it to exist.
>
> **Drift check (run first)**:
> `git diff --stat 92214ed..HEAD -- apps/web/src/app/globals.css apps/web/src/app/\(tabs\)/profil/page.tsx apps/web/src/app/\(tabs\)/layout.tsx apps/web/src/components/live/player-card.tsx apps/web/src/components/live/hit-fx.ts apps/web/src/components/live/summary.tsx apps/web/src/components/live/endgame.ts apps/web/src/components/live/endgame-decor.tsx apps/web/src/components/live/tap-lock.ts apps/web/src/components/rematch-button.tsx apps/web/src/lib/query-client.tsx apps/web/src/components/tab-bar.tsx`
>
> `92214ed` is the tip of the **un-merged** branch `integration/wave-3` (it
> carries plans 010–013). This plan was written against that branch because
> plans 011 and 012 — whose components it reuses — are not on `main` yet. By the
> time you execute, wave-3 is expected to be merged: run the drift check against
> `92214ed` anyway (the SHA stays reachable after a merge), and if any of those
> files changed since, compare the "Current state" excerpts against the live
> code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: `plans/011-degommage-hit-animation.md` and
  `plans/012-endgame-sequence.md` (**hard** — this plan mounts their components
  and references their CSS classes; nothing here works before they land).
  `plans/013-avatar-picker.md` (soft — it edits the same `/profil` header line).
- **Category**: dx
- **Planned at**: commit `5358160` (`main`) **+** branch `integration/wave-3`,
  tip `92214ed`, 2026-07-25

## Why this matters

Dégommix now ships two hand-tuned animation sequences — the dégommage hit combo
(011) and the end-of-game victory/defeat orchestrations (012) — and both are
**unreachable outside a real game**. Seeing the victory sequence today means
registering two accounts, creating a lobby, playing to the village and losing on
purpose on the second phone. That cost is paid every time somebody wants to
check a timing, a colour in dark mode, or how the sequence reads on a real
device after an iOS update.

This plan adds a hidden `/dev/animations` screen that plays all three sequences
on mock data, on demand, from the **installed PWA** — reached by long-pressing
the avatar block of `/profil` for 1.5 s. No devtools, no rebuild, no fake game.
The screen has no tab bar, so it reads as "out of the app" and cannot be reached
by wandering.

The gesture is deliberately undiscoverable rather than gated by an environment
variable: this is a private app for a group of friends, and the cost of a friend
finding an animations playground is zero, while the cost of an env flag is that
the tool is missing exactly where it is needed — the production PWA on a real
phone. See "Maintenance notes" for why this differs from `/dev/ui`.

## Current state

### Files involved and their role

- `apps/web/src/app/(tabs)/profil/page.tsx` — server component; its `<header>`
  holds the avatar + pseudo block that becomes the gesture surface.
- `apps/web/src/app/(tabs)/layout.tsx` — the only layout that renders `<TabBar />`
  for the tabbed screens. Read-only here; it is *why* a route outside `(tabs)`
  has no tab bar.
- `apps/web/src/app/dev/ui/page.tsx` — the existing dev screen, gated by
  `ALLOW_DEV_UI`. Read it (16 lines) so you understand the pattern this plan
  deliberately does **not** copy. Read-only.
- `apps/web/src/components/live/player-card.tsx` (011) — the roster card that
  plays the hit combo. **Reused verbatim. Do not modify.**
- `apps/web/src/components/live/hit-fx.ts` (011) — `hitByTarget`, `hitPhase`,
  `HIT_ONOMATOPEES`. **Reused verbatim. Do not modify.**
- `apps/web/src/components/live/summary.tsx` (012) — the end-of-game screen and
  its winner/loser orchestration. **Reused verbatim. Do not modify.**
- `apps/web/src/components/live/endgame.ts`, `endgame-decor.tsx` (012) — pure
  inputs and decor, pulled in transitively by `summary.tsx`. Read-only.
- `apps/web/src/app/globals.css` — home of every keyframe (`hit-*`, `eg-*`) and
  of the two `prefers-reduced-motion` blocks this plan mirrors. Gets ~20 new
  lines at the end; **nothing existing is edited**.
- `apps/web/src/components/live/tap-lock.ts` + `use-tap-lock.ts` +
  `tap-lock.test.ts` — the repo's **pure-logic + React-binding + node-test**
  trio. The long-press recognizer of this plan must match that shape.
- `apps/web/src/lib/query-client.tsx` — `QueryProvider`; needed because the
  summary mounts `RematchButton`, which calls `useQueryClient()`.

### Route groups — why `/dev/animations` has no tab bar (verified)

`TabBar` is **opt-in per route**, not global. Every mount site in the repo:

```
apps/web/src/app/(tabs)/layout.tsx:17:        <TabBar />
apps/web/src/app/lobby/[gameId]/page.tsx:34:      <TabBar />
apps/web/src/app/dev/ui/styleguide.tsx:177:      <TabBar />
```

`apps/web/src/app/(tabs)/layout.tsx` (whole file, verbatim):

```tsx
import { requireOnboardedSession } from '@/lib/session'
import { QueryProvider } from '@/lib/query-client'
import { ConnectionBanner } from '@/components/connection-banner'
import { SocketProvider } from '@/components/socket-provider'
import { TabBar } from '@/components/tab-bar'

export default async function TabsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireOnboardedSession()

  return (
    <QueryProvider>
      <SocketProvider>
        <ConnectionBanner />
        <div className="tabs-content">{children}</div>
        <TabBar />
      </SocketProvider>
    </QueryProvider>
  )
}
```

`/partie/[gameId]` uses the same mechanism, and its layout says so
(`apps/web/src/app/partie/[gameId]/layout.tsx`, doc comment, verbatim):

> Fullscreen live route, outside the `(tabs)` group: no tab bar, and its own
> socket provider since the tabs layout does not apply here.

There is **no** `apps/web/src/app/dev/layout.tsx`, so `/dev/*` inherits only the
root layout (`ThemeScript` + `ToastProvider`). **Consequence for this plan: put
the route at `apps/web/src/app/dev/animations/` and simply never import
`TabBar`.** `dev/ui/styleguide.tsx` renders a `<TabBar />` as a *design sample* —
do not copy that line.

### `apps/web/src/app/dev/ui/page.tsx` (whole file, 16 lines, verbatim)

```tsx
import { notFound } from 'next/navigation'
import { Styleguide } from './styleguide'

export const metadata = { title: 'Dégommix — Styleguide' }

/**
 * Internal design-system showcase. Hidden in production unless
 * ALLOW_DEV_UI=1 is set (used for visual QA against a production build).
 */
export default function DevUiPage() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_UI !== '1') {
    notFound()
  }

  return <Styleguide />
}
```

**Do not reproduce this guard in `/dev/animations`.** The decision is recorded
in "Maintenance notes"; if you copy it, the feature is dead on arrival (the
gesture would 404 in the installed PWA, which is the only place it is used).

### `apps/web/src/app/(tabs)/profil/page.tsx` — the header to wrap (lines 27–35 of the wave-3 version, verbatim)

```tsx
      <header className="flex items-center gap-3">
        <PlayerAvatar username={username} size={56} avatarId={avatarId} />
        <div>
          <h1 className="s-title m-0" style={{ fontSize: '1.05rem' }}>
            {username}
          </h1>
          <p className="s-sub">Ton profil de dégommeur</p>
        </div>
      </header>
```

> On `main` (pre-013) the same block exists without `avatarId={avatarId}`. Both
> are fine — you only wrap it, you never touch its contents.

### `apps/web/src/components/live/hit-fx.ts` (011) — the two functions you call

```ts
export const HIT_ONOMATOPEES = ['Paf !', 'Bam !', 'Tchac !', 'Vlan !', 'Ouch !', 'Boum !'] as const

export interface TargetHit {
  readonly count: number
  readonly seq: number
  readonly word: string
}

/** Folds the game's dégommage log into a `targetId → TargetHit` lookup. */
export function hitByTarget(log: readonly DegommageEntry[]): Record<string, TargetHit>

/** `"a"` or `"b"`, flipped by every new hit so the CSS animations restart. */
export function hitPhase(hit: TargetHit | undefined): 'a' | 'b' | undefined
```

`PlayerCard` reads `hit` and sets `data-hit={hitPhase(hit)}` on the card
(`player-card.tsx`, verbatim):

```tsx
export function PlayerCard({ player, username, isHost, taken, hit }: PlayerCardProps) {
  const phase = hitPhase(hit)

  return (
    <div
      className="card player-card flex items-center gap-3 p-3"
      data-testid={`player-card-${username}`}
      data-hit={phase}
```

**This is the replay mechanism you must reuse**: growing the mock log by one
entry flips `count` parity → `data-hit` flips `a`↔`b` → the CSS animation
restarts, and `hitByTarget` picks the next onomatopée from the *chain*, which is
exactly the "the word rotates on every replay" requirement. Do not add a
`key`-remount hack for the hit demo.

How the live screen derives it (`live-screen.tsx`, verbatim, including the
comment that explains the choice):

```tsx
  // Append-only per-target hit count: what drives the card animation. Distinct
  // from `taken`, which excludes undone dégommages and would therefore replay
  // the whole animation every time somebody presses « Annuler ».
  const hits = hitByTarget(state.degommageLog)
```

and the cards are laid out in a two-column grid — the star vectors in
`player-card.tsx` are sized for that (`/** Star exit vectors, sized for a
half-width roster card. */`):

```tsx
      <div className="relative z-10 grid grid-cols-2 gap-3">
```

### `apps/web/src/components/live/summary.tsx` (012) — the props and the skip mechanism

```tsx
interface SummaryProps {
  gameId: string
  state: GameState
  names: NameMap
  /** Who is looking — decides which end-of-game variant this phone plays. */
  viewerId: string
  startedAt: string | null
  endedAt: string | null
}
```

Internals that matter to this plan (verbatim):

```tsx
  const variant = endgameVariant(state.winnerId, viewerId)
  const timing = variant === 'loser' ? ENDGAME_TIMINGS.loser : ENDGAME_TIMINGS.winner
  const [phase, setPhase] = useState<'playing' | 'done'>(variant === 'none' ? 'done' : 'playing')
```

- The variant is chosen **only** from `state.winnerId` vs `viewerId`. Two demos
  = the same mock state rendered twice with two different `viewerId`s. No prop
  drilling, no new API, nothing to extract.
- `phase` starts at `'playing'` **on mount** → **remounting is the replay**
  (`key={runId}`), no change to `summary.tsx`.
- `ENDGAME_TIMINGS = { winner: { total: 3300, … }, loser: { total: 3050, … } }`
  — the sequences last ~3.3 s and ~3.05 s.
- The root is a `<main className="eg-root … min-h-dvh …">` with
  `onClick={() => setPhase('done')}` — a tap skips to the final image.

**Coupling verdict (do not extract anything):** `Summary` is a `'use client'`
component that takes plain data. Its only non-trivial dependency is
`RematchButton`, mounted twice in the actions block. `RematchButton` calls, at
mount:

```tsx
  const router = useRouter()
  const { socket } = useSocket()
  const { toast } = useToast()
  const invalidate = useInvalidateTabData()
```

- `useSocket()` reads a context with a **non-throwing default**
  (`{ socket: null, status: 'connecting', connected: false }` in
  `socket-provider.tsx`) → renders fine with **no** `SocketProvider`, and its
  handler starts with `if (!socket || pending) return`, so a click is a no-op.
- `useToast()` **throws** without a provider — but `ToastProvider` is mounted in
  the **root layout**, above every route group, so `/dev/animations` has it.
- `useInvalidateTabData()` calls `useQueryClient()`, which **throws** outside a
  `QueryClientProvider` → the playground **must** be wrapped in `QueryProvider`.

So: wrap in `QueryProvider`, do **not** mount `SocketProvider` (a demo screen has
no business opening a websocket), and change nothing in `summary.tsx`.

### Reduced motion — how 011 and 012 do it today (verbatim, `globals.css`)

011, around line 823:

```css
/* Reduced motion: no shake, no stars, no stamp — the counter just breathes. */
@media (prefers-reduced-motion: reduce) {
  .player-card[data-hit] { animation: none; }
  .hit-fx { display: none; }
  .player-card[data-hit='a'] .hit-tally { animation: hit-tally-fade-a 420ms ease both; }
  .player-card[data-hit='b'] .hit-tally { animation: hit-tally-fade-b 420ms ease both; }
}
```

012, around line 992, preceded by its rationale:

```css
/**
 * Reduced motion: the rest state IS the final image, so neutralising every
 * animation is the whole implementation — the screen appears complete, at once.
 */
@media (prefers-reduced-motion: reduce) {
  .eg-play,
  .eg-play *,
  .eg-play *::before,
  .eg-play *::after {
    animation: none !important;
  }
  .eg-confetti { display: none; }
}
```

`globals.css` contains **exactly 5** `@media (prefers-reduced-motion: reduce)`
blocks (`.cta`, `.segment`, the tab bar, hit, endgame). **This plan adds none
and edits none** — the « Mouvement réduit » switch re-applies the same
*declarations* under a `[data-motion='reduced']` attribute selector. See Step 5
for the exact block and the two documented limits.

### Repo conventions this plan must honor

- **Pure logic + React binding + node test**, modelled on the tap-lock trio:
  `tap-lock.ts` (framework-agnostic class, no React import) → `use-tap-lock.ts`
  (`'use client'`, thin binding) → `tap-lock.test.ts` (vitest, fake timers).
  Read all three before Step 1.
- **Vitest runs in the `node` environment** and only picks up `src/**/*.test.ts`
  (`apps/web/vitest.config.ts`, verbatim):
  ```ts
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  ```
  There is **no jsdom and no testing-library** in this repo. Component tests are
  impossible by design — which is precisely why the long-press logic must live
  in a plain `.ts` module with zero React imports.
- TypeScript strict, no `any`, named exports, kebab-case filenames, JSDoc on
  exported symbols, comments in English, **UI copy in French**.
- Design tokens: `var(--parchment)`, `var(--ink)`, `var(--ink-soft)`,
  `var(--ink-faint)`, `var(--bronze)`, `var(--surface-2)`. Shell classes:
  `.tab-page` (page shell, already handles `env(safe-area-inset-top)`), `.card`,
  `.s-title`, `.s-sub`, `.sec-label`, `.helper-text`.

## Commands you will need

| Purpose            | Command                                                        | Expected on success            |
|--------------------|----------------------------------------------------------------|--------------------------------|
| Install            | `pnpm install`                                                 | exit 0                         |
| Typecheck          | `pnpm typecheck`                                               | exit 0, no errors              |
| Lint               | `pnpm lint`                                                    | exit 0                         |
| Unit tests (all)   | `pnpm test`                                                    | all pass                       |
| Unit tests (this)  | `pnpm --filter @degommix/web exec vitest run src/components/dev` | all pass, ≥ 8 tests          |
| Dev server         | `pnpm --filter @degommix/web dev`                              | serves on `http://localhost:3000` |
| Production build   | `pnpm build`                                                   | exit 0                         |
| E2E happy path     | `pnpm test:e2e`                                                | 1 passed                       |

Integration suites need `docker compose -f docker-compose.test.yml up -d` and
serialization (`pnpm exec turbo run test --concurrency=1`) — that is the repo's
documented baseline (`plans/README.md`), unchanged by this plan.

## Suggested executor toolkit

- `superpowers:test-driven-development` for Step 1 (the recognizer is pure logic
  with a timer — write `long-press.test.ts` first).
- `superpowers:verification-before-completion` before claiming done: this plan's
  "Done criteria" are greps and commands; run them and paste the output.
- Read `plans/011-degommage-hit-animation.md` and `plans/012-endgame-sequence.md`
  if you need the design intent behind the sequences you are mounting.

## Scope

**In scope** (the only files you may modify or create):

- `apps/web/src/components/dev/long-press.ts` (create)
- `apps/web/src/components/dev/long-press.test.ts` (create)
- `apps/web/src/components/dev/use-long-press.ts` (create)
- `apps/web/src/components/dev/dev-menu-gesture.tsx` (create)
- `apps/web/src/app/dev/animations/page.tsx` (create)
- `apps/web/src/app/dev/animations/playground.tsx` (create)
- `apps/web/src/app/dev/animations/mocks.ts` (create)
- `apps/web/src/app/globals.css` (append one section at the end — no edits above)
- `apps/web/src/app/(tabs)/profil/page.tsx` (wrap the `<header>` contents only)
- `plans/README.md` (append your status row)

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/components/live/**` — `player-card.tsx`, `summary.tsx`,
  `hit-fx.ts`, `endgame.ts`, `endgame-decor.tsx` are shipped, playtested code.
  This plan exists *because* they can be mounted as-is; if you find yourself
  editing one, that is a STOP condition.
- `apps/web/src/app/dev/ui/**` — the styleguide and its `ALLOW_DEV_UI` guard
  stay exactly as they are.
- The 5 existing `@media (prefers-reduced-motion: reduce)` blocks in
  `globals.css` and every `@keyframes` — read them, copy nothing.
- `apps/web/src/components/tab-bar.tsx` — the tab bar is hidden by *route
  placement*, never by a new prop or a `usePathname` exception.
- `e2e/**` — the happy path never visits `/profil` (verified below); adding an
  e2e case for a hidden gesture is explicitly deferred.
- Any `ALLOW_*` env variable, `.env*` file, or `next.config.ts` entry.

## Git workflow

- Branch: `feat/dev-animations-menu` (repo convention: `type/short-description`,
  e.g. `feat/degommage-hit-animation`, `fix/ios-pwa-chrome`).
- Conventional commits, one per logical unit. Examples from `git log`:
  `feat(web): invalidate home and leaderboard caches when a game finishes`,
  `fix(web): ios pwa chrome — edge-to-edge status bar and floating tab bar (#23)`.
- Suggested commits: (1) `feat(web): long-press recognizer with unit tests`,
  (2) `feat(web): /dev/animations playground reusing the live animations`,
  (3) `feat(web): long-press the profile avatar to open the dev animations menu`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write the pure long-press recognizer + its tests

Create `apps/web/src/components/dev/long-press.ts`. **No React import in this
file** — it is the `tap-lock.ts` half of the trio.

Target shape:

```ts
/**
 * Long-press recognizer behind the hidden dev menu. Framework-agnostic on
 * purpose: the timing rules are the only thing worth testing, and this repo's
 * vitest runs in the `node` environment with no DOM (`apps/web/vitest.config.ts`).
 *
 * Touch rules: a press that drifts more than `tolerancePx` from its origin is a
 * scroll, not a hold, and cancels. So does lifting the finger early.
 */

/** Hold duration before the menu opens — long enough that no normal tap reaches it. */
export const LONG_PRESS_MS = 1500

/** Finger drift allowed during the hold, in CSS pixels. */
export const LONG_PRESS_MOVE_TOLERANCE_PX = 12

export interface LongPressPoint {
  readonly x: number
  readonly y: number
}

export class LongPress {
  constructor(
    onFire: () => void,
    holdMs: number = LONG_PRESS_MS,
    tolerancePx: number = LONG_PRESS_MOVE_TOLERANCE_PX,
  )

  /** True while a hold is armed (started, not yet fired or cancelled). */
  readonly isPressing: () => boolean
  /** Arms a hold at `point`. A second `start` re-arms from the new origin. */
  readonly start: (point: LongPressPoint) => void
  /** Feeds a move; cancels the hold once the drift exceeds the tolerance. */
  readonly move: (point: LongPressPoint) => void
  /** Cancels an armed hold — finger lifted, pointer cancelled, page scrolled, unmount. */
  readonly cancel: () => void
}
```

Implementation rules:
- `start` clears any existing timer first, stores the origin, then arms
  `setTimeout(holdMs)`.
- The timer callback clears its own state **before** calling `onFire()`, so the
  recognizer is idle when the navigation happens.
- `move` uses `Math.hypot(x - origin.x, y - origin.y) > tolerancePx` (a diagonal
  drift of 9 px + 9 px must cancel — 12.7 > 12).
- `move` and `cancel` on an idle recognizer are no-ops (never throw).
- Class fields as arrow properties (`readonly start = (…) => {…}`) so handlers
  can be destructured, exactly like `TapLock` in
  `apps/web/src/components/live/tap-lock.ts`.

Create `apps/web/src/components/dev/long-press.test.ts`, modelled structurally on
`apps/web/src/components/live/tap-lock.test.ts` (same imports, same
`beforeEach(() => vi.useFakeTimers())` / `afterEach(() => vi.useRealTimers())`).
Cover, at minimum, these eight cases:

1. does not fire before the hold elapses (advance `LONG_PRESS_MS - 1`)
2. fires exactly once at `LONG_PRESS_MS`
3. `cancel()` before the deadline prevents firing
4. a move **within** tolerance keeps the hold armed and it still fires
5. a move **beyond** tolerance cancels (diagonal case: `{x: 9, y: 9}` from the
   origin must cancel)
6. `start()` again re-arms from the new origin (drift is measured from the
   second origin, not the first)
7. after firing, advancing the timers further never fires a second time, and
   `isPressing()` is `false`
8. `move()` / `cancel()` before any `start()` are no-ops

**Verify**:
`pnpm --filter @degommix/web exec vitest run src/components/dev/long-press.test.ts`
→ exit 0, ≥ 8 tests passed.
`grep -c "from 'react'" apps/web/src/components/dev/long-press.ts` → `0`.

### Step 2: Add the React binding `useLongPress`

Create `apps/web/src/components/dev/use-long-press.ts`, modelled on
`use-tap-lock.ts` (`'use client'`, thin, disposes on unmount):

```ts
'use client'

import { useEffect, useMemo, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react'
import { LONG_PRESS_MS, LongPress } from './long-press'

export interface LongPressHandlers {
  onPointerDown: (event: ReactPointerEvent) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onPointerLeave: () => void
  onContextMenu: (event: ReactMouseEvent) => void
}

/** React binding of {@link LongPress} — that module documents the gesture rules. */
export function useLongPress(onFire: () => void, holdMs: number = LONG_PRESS_MS): LongPressHandlers
```

Implementation rules:
- Keep `onFire` in a ref updated on every render, and build the `LongPress` in
  `useMemo(… , [holdMs])` so the recognizer is stable across renders.
- One `useEffect` that (a) registers `window.addEventListener('scroll', cancel,
  { capture: true, passive: true })` and (b) returns a cleanup calling
  `press.cancel()` and removing the listener. A page scroll always cancels the
  hold, even when the browser does not emit `pointercancel`.
- `onPointerDown` ignores secondary buttons (`if (event.button !== 0) return`)
  and feeds `{ x: event.clientX, y: event.clientY }`.
- `onContextMenu` calls `event.preventDefault()` — otherwise Android and desktop
  pop their context menu mid-hold.

**Verify**: `pnpm typecheck` → exit 0.
`grep -n "'use client'" apps/web/src/components/dev/use-long-press.ts` → line 1.

### Step 3: Add the gesture wrapper component

Create `apps/web/src/components/dev/dev-menu-gesture.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useLongPress } from './use-long-press'

/**
 * Hidden entry point of the animations playground: a 1.5 s hold on the profile
 * avatar block opens `/dev/animations`. The gesture IS the gate — see
 * `plans/014-dev-animations-menu.md` for why this screen is not behind
 * `ALLOW_DEV_UI` like `/dev/ui`.
 *
 * Children stay a server subtree: this component only adds pointer handlers and
 * the layout classes the header used to carry itself.
 */
export function DevMenuGesture({ children }: { children: ReactNode }) {
  const router = useRouter()
  const handlers = useLongPress(() => {
    router.push('/dev/animations')
  })

  return (
    <div className="dev-longpress flex items-center gap-3" {...handlers}>
      {children}
    </div>
  )
}
```

No `role`, no `tabIndex`, no `aria-label`: this is an intentionally
undiscoverable gesture, not a control (see "Maintenance notes").

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Create the mock game data

Create `apps/web/src/app/dev/animations/mocks.ts` — plain data, no React:

```ts
import type { DegommageEntry, GameState } from '@degommix/game-core'
import type { NameMap } from '@/components/live/types'
```

Export:
- `DEMO_GAME_ID = 'demo-animations'` (a stable string: `pickTease` and
  `confettiPieces` are seeded from it, so the demo is reproducible).
- `HERO_ID = 'demo-hero'`, `RIVAL_ID = 'demo-rival'`.
- `DEMO_NAMES: NameMap = { [HERO_ID]: 'Astérix', [RIVAL_ID]: 'Caius Bonus' }`.
- `DEMO_LOG: readonly DegommageEntry[]` — **8 entries**, all
  `targetId: HERO_ID`, `actorId: RIVAL_ID`, with strictly increasing `seq`
  values that are **not** consecutive (e.g. `3, 7, 12, 18, 25, 31, 40, 46`):
  `hitByTarget` hashes the `seq`, so varied seeds make the onomatopée rotation
  visible instead of looking periodic.
- `DEMO_FINISHED: GameState` — `status: 'finished'`, `format: 2`,
  `seats: [HERO_ID, RIVAL_ID]`, both players in `players` with
  `character: 'asterix'` / `'caius_bonus'`, `inGame: true`, plausible
  `degommages` (e.g. 7 and 5), `degommageLog: [...DEMO_LOG]`,
  `undoneSeqs: new Set<number>()`, `pendingEndRequest: null`,
  `outcome: 'village_reached'`, `winnerId: HERO_ID`, `lastSeq: 46`.
- `DEMO_STARTED_AT` / `DEMO_ENDED_AT` — fixed ISO strings ~12 min apart, so the
  « Durée » tile shows a real chrono.

`GameState`, `PlayerState` and `DegommageEntry` are defined in
`packages/game-core/src/types.ts` — read them and satisfy every field; do not
cast.

**Verify**: `pnpm typecheck` → exit 0 (proves the mock matches `GameState`
exactly, with no `as`).
`grep -n "as GameState\|as unknown\|: any" apps/web/src/app/dev/animations/mocks.ts`
→ no matches.

### Step 5: Add the playground CSS (append only)

Append **one** section at the **end** of `apps/web/src/app/globals.css`. Do not
touch anything above it.

```css
/* ---------- Dev animations playground (/dev/animations) ---------- */

/**
 * The gesture surface on /profil: a 1.5 s hold must not trigger iOS's text
 * selection or its link/image callout, which would eat the gesture.
 */
.dev-longpress {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  touch-action: manipulation;
}

/** Fullscreen stage for a demo sequence, above the playground list. */
.dev-stage {
  position: fixed;
  inset: 0;
  z-index: 60;
  overflow-y: auto;
  background: var(--parchment);
}

.dev-stage-close {
  position: fixed;
  z-index: 61;
  top: calc(0.75rem + env(safe-area-inset-top));
  right: 0.9rem;
}

/**
 * « Mouvement réduit » switch of the playground. It re-applies — under a data
 * attribute instead of a media query — exactly the declarations of the two
 * `prefers-reduced-motion` blocks above, so a demo can be previewed in reduced
 * form without changing the phone's accessibility settings. No keyframe is
 * duplicated: both paths reference the same `hit-tally-fade-*` animations.
 *
 * The switch can only ADD reduction — a media query cannot be un-applied — so
 * a user whose OS asks for reduced motion still gets it here and everywhere
 * else, whatever the toggle says. Nothing outside `[data-motion='reduced']`
 * changes, so no real screen is affected.
 *
 * Not covered, deliberately: the 900 ms dégommage counter roll in `summary.tsx`
 * reads `window.matchMedia('(prefers-reduced-motion: reduce)')` in an effect,
 * so it follows the OS only. Making it overridable would mean changing a live
 * screen for the sake of a dev tool.
 */
[data-motion='reduced'] .player-card[data-hit] { animation: none; }
[data-motion='reduced'] .hit-fx { display: none; }
[data-motion='reduced'] .player-card[data-hit='a'] .hit-tally { animation: hit-tally-fade-a 420ms ease both; }
[data-motion='reduced'] .player-card[data-hit='b'] .hit-tally { animation: hit-tally-fade-b 420ms ease both; }

[data-motion='reduced'] .eg-play,
[data-motion='reduced'] .eg-play *,
[data-motion='reduced'] .eg-play *::before,
[data-motion='reduced'] .eg-play *::after {
  animation: none !important;
}
[data-motion='reduced'] .eg-confetti { display: none; }
```

**Verify**:
`grep -c "prefers-reduced-motion" apps/web/src/app/globals.css` → `5` (unchanged).
`git diff -U0 apps/web/src/app/globals.css | grep -c '^-'` → `0` (append-only:
no deleted line other than the diff header, which `-U0` keeps out of `^-` only
for `---`; if the count is `1`, confirm the single match is the `--- a/…`
header).
`grep -c "@keyframes" apps/web/src/app/globals.css` → same number as before your
change (record it first with `git stash` or from `git show HEAD:…`).

### Step 6: Build the playground screen

Create `apps/web/src/app/dev/animations/page.tsx` (server component, ~10 lines):

```tsx
import { Playground } from './playground'

export const metadata = { title: 'Dégommix — Animations' }

/**
 * Hidden animations playground, reached by long-pressing the avatar block of
 * /profil. Outside the `(tabs)` group on purpose: no tab bar. No session check
 * and no env gate — it renders nothing but mock data (see
 * `plans/014-dev-animations-menu.md`).
 */
export default function DevAnimationsPage() {
  return <Playground />
}
```

Create `apps/web/src/app/dev/animations/playground.tsx` (`'use client'`). Target
structure — French copy exactly as written:

```tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'
import { QueryProvider } from '@/lib/query-client'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PlayerCard } from '@/components/live/player-card'
import { Summary } from '@/components/live/summary'
import { hitByTarget } from '@/components/live/hit-fx'
import {
  DEMO_ENDED_AT, DEMO_FINISHED, DEMO_GAME_ID, DEMO_LOG, DEMO_NAMES,
  DEMO_STARTED_AT, HERO_ID, RIVAL_ID,
} from './mocks'
```

Root (note: **`<div>`, not `<main>`** — the only `<main>` on this page must be
the one `Summary` renders when a sequence is on stage):

```tsx
    <QueryProvider>
      <div className="tab-page" data-motion={reduced ? 'reduced' : undefined}>
```

Content, in order:

1. A « Retour » link back to the profile, same shape as the one at the top of
   `/profil` (verbatim from `profil/page.tsx`, with the href and label changed):
   ```tsx
   <Link href="/profil" className="sec-label flex items-center gap-1 no-underline"
         style={{ color: 'var(--ink-faint)' }}>
     <Icon name="chevron-right" size={12} className="rotate-180" />
     Retour au profil
   </Link>
   ```
2. Header: `<h1 className="s-title m-0">Animations</h1>` +
   `<p className="s-sub">Terrain d’essai — rien ici n’est une vraie partie.</p>`
3. **Toggle** — a `Card` with `<p className="sec-label">Mouvement réduit</p>`, a
   `<Button variant="ghost" aria-pressed={reduced} onClick={…}>` labelled
   `Mouvement réduit : activé` / `: désactivé`, and the helper text:
   `« Simule le réglage d’accessibilité, ici seulement. Le réglage du téléphone,
   lui, s’applique partout et gagne toujours. »`
4. **Section « Dégommage »** — `<p className="sec-label">Dégommage</p>` + a
   `Card` containing the two-column grid that mirrors the live screen, with the
   real `PlayerCard`:
   ```tsx
   const hits = hitByTarget(DEMO_LOG.slice(0, hitCount))
   …
   <div className="grid grid-cols-2 gap-3">
     <PlayerCard
       player={DEMO_FINISHED.players[HERO_ID]!}
       username={DEMO_NAMES[HERO_ID]!}
       isHost
       taken={hitCount}
       hit={hits[HERO_ID]}
     />
     <PlayerCard
       player={DEMO_FINISHED.players[RIVAL_ID]!}
       username={DEMO_NAMES[RIVAL_ID]!}
       isHost={false}
     />
   </div>
   ```
   plus `<Button onClick={() => setHitCount((n) => (n >= DEMO_LOG.length ? 1 : n + 1))}>Rejouer le dégommage</Button>`
   and a helper line naming the current onomatopée:
   `Onomatopée : {hits[HERO_ID]?.word ?? '—'} · coup {hitCount}/{DEMO_LOG.length}`.
   `hitCount` starts at `0` so the card is at rest on arrival; the first press
   plays hit 1. Wrapping back to `1` (not `0`) keeps every later press animated.
5. **Sections « Victoire » and « Défaite »** — each a `Card` with a short French
   description (`Séquence complète, ~3,3 s` / `~3 s`) and a
   `<Button onClick={() => setStage('winner')}>Lancer la séquence</Button>`.
6. **The stage**, rendered when `stage !== null`:
   ```tsx
   {stage !== null ? (
     <div className="dev-stage">
       <div className="dev-stage-close">
         <Button variant="ghost" onClick={() => setStage(null)}>Fermer</Button>
       </div>
       <Summary
         key={`${stage}-${runId}`}
         gameId={DEMO_GAME_ID}
         state={DEMO_FINISHED}
         names={DEMO_NAMES}
         viewerId={stage === 'winner' ? HERO_ID : RIVAL_ID}
         startedAt={DEMO_STARTED_AT}
         endedAt={DEMO_ENDED_AT}
       />
       <div className="dev-stage-replay">…</div>
     </div>
   ) : null}
   ```
   `viewerId` is the whole variant switch (`endgameVariant(winnerId, viewerId)`):
   `HERO_ID` is the winner → « VICTOIRE », `RIVAL_ID` → « DÉFAITE… ». The replay
   button bumps `runId`, which remounts `Summary` through its `key` and restarts
   `phase` at `'playing'`. Put the replay button next to « Fermer » inside
   `.dev-stage-close` rather than adding a third CSS class if that reads better —
   just keep both reachable while the sequence plays.

Keep the file under 300 lines. If it grows past that, move the « Dégommage »
section into `apps/web/src/app/dev/animations/hit-demo.tsx` — that is the only
extra file you may create beyond the Scope list, and it must stay in the same
directory.

**Verify**:
`pnpm typecheck` → exit 0.
`pnpm lint` → exit 0.
`grep -rn "TabBar\|@keyframes\|ALLOW_DEV_UI" apps/web/src/app/dev/animations/` →
no matches.
`grep -rn "hit-shake\|eg-fall\|eg-engrave\|hit-stamp" apps/web/src/app/dev/animations/`
→ no matches (the demos apply existing classes through the real components; they
never restate an animation).

Then run `pnpm --filter @degommix/web dev` and open
`http://localhost:3000/dev/animations` directly: the three sections render, no
tab bar is visible at the bottom, and both sequences play.

### Step 7: Wire the gesture into `/profil`

In `apps/web/src/app/(tabs)/profil/page.tsx`, wrap **only** the header contents.
Add the import next to the other component imports:

```tsx
import { DevMenuGesture } from '@/components/dev/dev-menu-gesture'
```

and replace the header block with:

```tsx
      <header>
        <DevMenuGesture>
          <PlayerAvatar username={username} size={56} avatarId={avatarId} />
          <div>
            <h1 className="s-title m-0" style={{ fontSize: '1.05rem' }}>
              {username}
            </h1>
            <p className="s-sub">Ton profil de dégommeur</p>
          </div>
        </DevMenuGesture>
      </header>
```

(Drop `avatarId={avatarId}` if plan 013 has not landed — match whatever the file
currently passes; you are moving that line, not editing it.) The
`flex items-center gap-3` classes move onto `DevMenuGesture`'s own `<div>`, so
the rendered layout is byte-identical.

**Verify**:
`pnpm typecheck` → exit 0.
`grep -c "DevMenuGesture" "apps/web/src/app/(tabs)/profil/page.tsx"` → `3`
(import + opening tag + closing tag).
`grep -n "flex items-center gap-3" "apps/web/src/app/(tabs)/profil/page.tsx"` →
no match (the classes now live in `dev-menu-gesture.tsx`).

Manual check on a touch device or with Chrome devtools' touch emulation:
- hold the avatar block 1.5 s → lands on `/dev/animations`, no tab bar;
- tap it normally → nothing happens;
- start a hold then scroll the page → nothing happens;
- the pseudo text is not selected by the hold.

### Step 8: Full verification pass

Run, in order, and confirm each:

```
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm build` matters here: it is the only check that `/dev/animations` compiles
as a route (a client/server boundary mistake in Step 6 fails the build, not the
typecheck).

## Test plan

- **New unit tests**: `apps/web/src/components/dev/long-press.test.ts`, the eight
  cases listed in Step 1 (before-deadline, fires-once, early cancel, move within
  tolerance, diagonal move beyond tolerance, re-arm on second `start`, no double
  fire after firing, no-ops when idle).
- **Structural pattern to copy**: `apps/web/src/components/live/tap-lock.test.ts`
  — same vitest imports, same fake-timer setup/teardown, one `describe` with
  behaviour-named `it`s.
- **Nothing else is unit-testable in this plan**, and that is deliberate: no
  jsdom, no testing-library (`vitest.config.ts` → `environment: 'node'`,
  `include: ['src/**/*.test.ts']`). The screen itself is verified by
  `pnpm build` plus the manual checks in Steps 6–7. **Do not add a test runner,
  jsdom, or testing-library to make component tests possible** — that is a
  separate decision, out of scope.
- **E2E**: this plan touches one file the suite renders (`/profil`) — but the
  happy path never visits it. Verify before and after:
  `grep -rn "profil\|avatar" e2e/happy-path.spec.ts` → **no matches**.
  Then run `pnpm test:e2e` → 1 passed. No new e2e case: a 1.5 s hold is
  expensive to drive and the screen has no production behaviour to protect.
- **Verification**: `pnpm test` → all pass, including the ≥ 8 new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0; `pnpm --filter @degommix/web exec vitest run src/components/dev` reports ≥ 8 passing tests
- [ ] `pnpm build` exits 0
- [ ] `pnpm test:e2e` → 1 passed
- [ ] `git status --porcelain` lists only the files in the "In scope" section (plus `hit-demo.tsx` if Step 6's size escape hatch was used)
- [ ] `git diff --stat -- apps/web/src/components/live/` → **empty** (no shipped animation component was modified)
- [ ] `git diff --stat -- apps/web/src/app/dev/ui/` → **empty**
- [ ] `grep -c "prefers-reduced-motion" apps/web/src/app/globals.css` → `5` (no new and no removed media query)
- [ ] `grep -rn "@keyframes" apps/web/src/app/dev/ apps/web/src/components/dev/` → no matches (zero duplicated keyframes)
- [ ] `grep -rn "TabBar" apps/web/src/app/dev/animations/` → no matches (the tab bar is hidden by route placement)
- [ ] `grep -rn "ALLOW_DEV_UI\|process.env" apps/web/src/app/dev/animations/ apps/web/src/components/dev/` → no matches (no env gate)
- [ ] `grep -c "from 'react'" apps/web/src/components/dev/long-press.ts` → `0` (the recognizer stays framework-agnostic)
- [ ] `grep -rn ": any\|as unknown\|@ts-expect-error" apps/web/src/app/dev/animations/ apps/web/src/components/dev/` → no matches
- [ ] `grep -c "DevMenuGesture" "apps/web/src/app/(tabs)/profil/page.tsx"` → `3`
- [ ] Manual, on a touch device or with touch emulation: a 1.5 s hold on the avatar block opens `/dev/animations` with **no tab bar**; a normal tap does nothing; a hold interrupted by a scroll does nothing
- [ ] Manual: « Rejouer le dégommage » pressed 4× shows **4 different** onomatopées in a row
- [ ] Manual: « Victoire » and « Défaite » each play their full sequence and can be replayed without leaving the stage
- [ ] Manual: with « Mouvement réduit » on, the hit demo shows no shake/stars/stamp and both sequences appear instantly at their final image
- [ ] `plans/README.md` status row for 014 added

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows `player-card.tsx`, `summary.tsx`, `hit-fx.ts`,
  `endgame.ts` or the `hit-*`/`eg-*` blocks of `globals.css` changed since
  `92214ed`, and the excerpts in "Current state" no longer match.
- Plans 011 and/or 012 are **not** in your working tree
  (`test -f apps/web/src/components/live/hit-fx.ts && test -f apps/web/src/components/live/endgame.ts`
  must both succeed). Everything here depends on them; there is no partial
  version of this plan.
- Mounting `Summary` inside `QueryProvider` still throws at runtime (e.g. a
  provider requirement was added to `RematchButton` after this plan was
  written). Report the missing provider rather than mounting `SocketProvider` —
  a demo screen opening a websocket is a decision the owner has to make.
- Making a demo work appears to require editing anything under
  `apps/web/src/components/live/`. The premise of this plan is that those
  components mount as-is; if that is false, the correct outcome is a report, not
  a refactor.
- The assumption "the long-press gesture is reachable in the installed PWA" turns
  out to be false — e.g. iOS swallows the hold on that element even with
  `-webkit-touch-callout: none`. Report it; the fallback (a triple-tap, or moving
  the surface to the « Dégommix · v1 » footer line) is an owner decision.
- Any verification fails twice after a reasonable fix attempt.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **Why no `ALLOW_DEV_UI`-style gate, unlike `/dev/ui`.** `/dev/ui` is a
  styleguide used for visual QA against a production *build*, on a laptop, where
  setting an env var is free; hiding it in production costs nothing. This screen
  is the opposite: its entire value is being reachable **from the installed PWA
  on a real phone**, which is production. An env gate would 404 it exactly where
  it is meant to be used. Dégommix is a private app for one group of friends and
  the screen renders only hard-coded mock data — no session, no DB read, no
  user-identifying content — so the worst case of a friend finding it is that
  they watch the victory animation. **The 1.5 s hold is the gate.** If the app
  ever opens to strangers, revisit this first: the cheapest fix is to move the
  route under a `(dev)` group with a `layout.tsx` that calls `notFound()` unless
  `process.env.ALLOW_DEV_UI === '1'`, mirroring `/dev/ui`, and to keep the
  gesture as the only entry point.
- **Alternatives considered and rejected** (do not "fix" these silently):
  *a keyboard/`aria` affordance on the gesture* — rejected, an accessible
  control would be discoverable, which defeats the point; the screen is
  reachable by typing the URL for anyone who needs it without the gesture.
  *A `?dev=1` query param or a tap-count Easter egg* — rejected as either
  guessable or flakier on touch. *Adding the reduced-motion override as a sixth
  `@media` block* — impossible; a media query cannot be forced on, which is
  exactly why the switch is an attribute selector.
- **The reduced-motion switch duplicates declarations, never keyframes.** If
  somebody edits either `prefers-reduced-motion` block for `hit-*` or `eg-*`,
  the matching `[data-motion='reduced']` rules at the end of `globals.css` must
  be updated in the same commit or the playground starts lying. A reviewer
  should diff those two regions together. The switch can only *add* reduction:
  the OS setting still wins everywhere, including here.
- **Known gap**: the 900 ms dégommage counter roll in `summary.tsx` reads
  `window.matchMedia` directly, so it keeps rolling under the demo switch.
  Deferred on purpose — making it overridable means adding a prop to a live
  screen for a dev tool's benefit.
- **What a reviewer should scrutinize**: (1) that
  `git diff --stat -- apps/web/src/components/live/` is empty; (2) that the
  `/profil` header renders identically (the flex classes moved, they did not
  disappear); (3) that `page.tsx` under `dev/animations` has no session call —
  adding one would make the screen depend on auth for no reason; (4) that the
  new CSS is strictly appended.
- **Follow-ups deliberately deferred**: an e2e case for the gesture; a "journal
  messages" demo (010) on the same screen — trivial to add later as a fourth
  section reusing `degommage-messages.ts`, and the natural next contribution to
  this playground; and adding jsdom + testing-library so the screen itself could
  be tested, which is a repo-wide decision, not this plan's.
