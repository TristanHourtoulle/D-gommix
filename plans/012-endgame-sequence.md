# Plan 012: Play a two-variant end-of-game sequence on the existing summary screen

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, add (or update) the status row for this
> plan in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index. Note: at the time of writing, `plans/README.md` on `main`
> only lists 001–007; rows for 008–013 are landing through separate PRs, so
> **append** your row rather than expecting it to exist.
>
> **Drift check (run first)**:
> `git diff --stat e772284..HEAD -- apps/web/src/components/live/summary.tsx apps/web/src/components/live/live-screen.tsx apps/web/src/components/rematch-button.tsx apps/web/src/app/globals.css e2e/happy-path.spec.ts`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW-MED
- **Depends on**: none (see "Interactions" for the soft overlap with 011)
- **Category**: direction
- **Planned at**: commit `e772284`, 2026-07-25

## Why this matters

The end of a Dégommix game is the loudest moment at the table and the quietest
moment in the app: the host validates, and four phones swap the live screen for
a static recap card. Nothing marks the transition, so the moment belongs to the
board and not to the app that just spent forty minutes tracking it.

The owner validated a **two-variant animated sequence, played on the existing
summary screen** — no extra route, no extra screen — triggered when the game
reaches `finished`:

- **Winner variant (~3.3 s)**: bronze rays, « VICTOIRE » engraved letter by
  letter, a laurel wreath drawn stroke by stroke, confetti in the four camp
  colours, the recap rows and stat tiles cascading in with the dégommage counter
  rolling 0 → N, and the arcade buttons settling last.
- **Loser variant (~3.05 s)**: an ink veil, « DÉFAITE… » dropping and bouncing,
  the pawn tipping over, a short teasing line (never humiliating), a fair-play
  band naming the winner, the same cascade, and « Revanche ? » posing with a
  single breath.

Each phone picks its own variant from `winnerId === me`. It is always
interruptible — one tap completes it — and under `prefers-reduced-motion` the
rest state *is* the final image, so the screen simply appears, complete, with no
animation at all.

## Current state

### Files involved and their role

- `apps/web/src/components/live/summary.tsx` — the screen to animate. Whole
  file quoted below; it is 120 lines and it is the **only** consumer of the
  end-of-game data.
- `apps/web/src/components/live/live-screen.tsx` — swaps to `<Summary>` when the
  state reaches `finished`; owns `viewerId`, which `Summary` does not receive
  today and needs.
- `apps/web/src/components/rematch-button.tsx` — the « Rejouer » button used in
  the summary actions. Quoted; **read-only** in this plan.
- `apps/web/src/app/globals.css` — where keyframes live.
- `e2e/happy-path.spec.ts` — asserts the summary content; must keep passing
  **unmodified**.

### `apps/web/src/components/live/summary.tsx` (whole file, 120 lines, verbatim)

```tsx
'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import type { GameState } from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { RematchButton } from '@/components/rematch-button'
import { Button } from '@/components/ui/button'
import { CharacterBadge } from '@/components/ui/character-badge'
import { Pill } from '@/components/ui/pill'
import { StatTile } from '@/components/ui/stat-tile'
import { CHARACTER_META } from '@/lib/characters'
import { formatChrono } from '@/lib/chrono'
import { displayName, type NameMap } from './types'

interface SummaryProps {
  gameId: string
  state: GameState
  names: NameMap
  startedAt: string | null
  endedAt: string | null
}

const FORMAT_LABELS = { 2: '1v1', 3: '3J', 4: '4J' } as const

/**
 * Inline end-of-game recap (same route, design §5.2 Résumé): winner header
 * with the character portrait fading in the background — or « Partie
 * abandonnée » — per-player sword tallies, stat tiles and the follow-up CTAs.
 */
export function Summary({ gameId, state, names, startedAt, endedAt }: SummaryProps) {
  const router = useRouter()

  const winner = state.winnerId ? state.players[state.winnerId] : undefined
  const durationSec =
    startedAt !== null && endedAt !== null
      ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000))
      : null
  const totalDegommages = Object.values(state.players).reduce((sum, p) => sum + p.degommages, 0)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-6">
      <h1 className="s-title">Résumé de partie</h1>

      {winner ? (
        <section className="card relative overflow-hidden p-4">
          <Image
            src={CHARACTER_META[winner.character].portraitSrc}
            alt=""
            width={240}
            height={240}
            className="pointer-events-none absolute -top-4 -right-6 h-auto w-40"
            style={{ opacity: 0.16, transform: 'rotate(6deg)' }}
          />
          <div className="relative flex flex-col items-start gap-2">
            <Pill variant="win">Victoire</Pill>
            <CharacterBadge character={winner.character} size="lg" />
            <p className="m-0 text-lg font-extrabold">{displayName(names, winner.userId)}</p>
            <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
              {CHARACTER_META[winner.character].label}
              {durationSec !== null ? ` · village atteint en ${formatChrono(durationSec)}` : ''}
            </p>
          </div>
        </section>
      ) : (
        <section className="card flex flex-col items-start gap-2 p-4">
          <Pill variant="wait">Partie abandonnée</Pill>
          <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
            Pas de vainqueur cette fois-ci.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        {state.seats.map((userId) => {
          const player = state.players[userId]
          if (!player) return null
          const isWinner = userId === state.winnerId
          return (
            <div
              key={userId}
              className="card flex items-center gap-3 p-3"
              data-testid={`summary-row-${displayName(names, userId)}`}
              style={isWinner ? { borderColor: 'var(--bronze)' } : undefined}
            >
              <CharacterBadge character={player.character} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-sm font-bold">{displayName(names, userId)}</p>
                <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
                  {CHARACTER_META[player.character].label}
                  {isWinner ? ' · vainqueur' : ''}
                  {!player.inGame && !isWinner ? ' · a quitté la partie' : ''}
                </p>
              </div>
              <span className="flex items-center gap-1 text-sm font-bold" title="Pions dégommés">
                <Icon name="sword" size={14} />
                {player.degommages}
              </span>
            </div>
          )
        })}
      </section>

      <div className="stat-row">
        <StatTile
          icon="timer"
          label="Durée"
          value={durationSec !== null ? formatChrono(durationSec) : '—'}
        />
        <StatTile icon="sword" label="Dégommages" value={totalDegommages} />
        <StatTile icon="flag" label="Format" value={FORMAT_LABELS[state.format]} />
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <Button onClick={() => router.push('/classement')}>Voir le classement</Button>
        <RematchButton finishedGameId={gameId} variant="ghost" />
      </div>
    </main>
  )
}
```

**The structure is already exactly what the sequence needs**: a winner header, a
per-player recap list, a three-tile stat row, and two stacked actions. This plan
adds animation and two new decorative blocks; it does **not** restructure the
screen.

Note what is **already there and must survive**:

- `data-testid={`summary-row-${username}`}` — asserted by
  `e2e/happy-path.spec.ts:129-131`.
- The literal strings « Résumé de partie », « Victoire », « vainqueur », and
  « village atteint en … » — asserted by `e2e/happy-path.spec.ts:127-133`.
- `<RematchButton finishedGameId={gameId} variant="ghost" />` — plan 002's
  refactor; **already on `main` at this commit**, do not re-implement it.

### `apps/web/src/components/live/live-screen.tsx` — the render site (lines 99–109) and `viewerId`

```tsx
  if (state.status === 'finished') {
    return (
      <Summary
        gameId={gameId}
        state={state}
        names={names}
        startedAt={startedAt ?? fallbackStartedAt}
        endedAt={journal.lastEventAt ?? fallbackEndedAt}
      />
    )
  }
```

`viewerId` is a prop of `LiveScreen` (line 27 of its props interface) and is
used at lines 112–114:

```tsx
  const opponents = inGame.filter((p) => p.userId !== viewerId)
  const me = state.players[viewerId]
```

**`Summary` does not receive it.** Passing it down is the whole "which variant"
mechanism and is the only change this plan makes to `live-screen.tsx`.

`Summary` is imported in exactly one place — verified:
`grep -rn "from './summary'" apps/web/src` → `live-screen.tsx:20`.

### `apps/web/src/app/globals.css` — the conventions to match

The file is 589 lines with exactly one `@keyframes` block (`water-squash`, lines
579–583) followed by its reduced-motion neutraliser (lines 585–588). Tailwind 4
is imported at line 1; design tokens are CSS custom properties on `:root`
(lines 3–30), mirrored for dark by `@media (prefers-color-scheme: dark)` and
`:root[data-theme="dark"]`.

The four camp colours (used by the confetti) and the rest of the palette:

```css
  --asterix: #b23a2e;    /* dark: #e2564a */
  --obelix: #2c5b82;     /* dark: #5b93c4 */
  --caius: #b9861f;      /* dark: #e3ac3e */
  --caligula: #3f6b3c;   /* dark: #6fa867 */
  --ink: #251a10;        /* dark: #f1e3c2 */
  --bronze: #8c5a2b;     /* dark: #d79a4b */
  --surface-2: #fbf6e9;  /* dark: #2b2115 */
  --font-display: var(--font-cinzel, 'Cinzel'), 'Times New Roman', Georgia, serif;
```

The classes the summary already uses, so you know what you are animating:

```css
.stat-row { display: flex; gap: 0.6rem; }
.stat-tile { flex: 1; background: var(--surface-2); border: 1.5px solid var(--parchment-line);
  border-radius: 12px; padding: 0.6rem 0.5rem; text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 0.2rem; }
.stat-num { font-family: var(--font-mono); font-variant-numeric: tabular-nums;
  font-size: 1.15rem; font-weight: 700; }
.card { background: var(--surface-2); border: 1.5px solid var(--parchment-line);
  border-radius: 14px; padding: 0.85rem 0.95rem; }
```

### `e2e/happy-path.spec.ts` — everything it asserts on this screen (lines 126–134)

```ts
    // — Step 8a: summary on both screens, J2 winner, correct counters —
    await expect(p2.getByText('Résumé de partie')).toBeVisible()
    await expect(p2.getByText('Victoire')).toBeVisible()
    await expect(p2.getByTestId(`summary-row-${J2.username}`)).toContainText('vainqueur')
    await expect(p2.getByTestId(`summary-row-${J1.username}`)).toContainText('1')
    await expect(p1.getByText('Résumé de partie')).toBeVisible()
    await shot(p2, '13-resume')
```

Two consequences you must design around:

1. `toBeVisible()` fails on an element with `opacity: 0`. Every cascade
   animation therefore uses `animation-fill-mode: both` with a *visible* end
   state and a delay measured in hundreds of milliseconds — Playwright's default
   expect timeout is 15 s (`e2e/playwright.config.ts`), so a ≤ 3.3 s sequence
   passes comfortably. **Do not** set `opacity: 0` as a *static* style on any
   asserted element; it must only ever be the `0 %` frame of an animation that
   ends visible.
2. `p1` is the loser (`Asterix`) and `p2` the winner (`Obelix`), so **both**
   variants are exercised by the existing e2e run.

### Repo conventions that apply

- TypeScript strict, `noUncheckedIndexedAccess: true`, `noImplicitReturns:
  true`. No `any`, no `as` casts (except the documented `as CSSProperties` idiom
  used by `apps/web/src/components/ui/character-badge.tsx:21` when passing a CSS
  custom property through `style`).
- English code and comments; French only in user-facing strings, with the
  typographic apostrophe `’` (U+2019).
- Tests are pure-TS `*.test.ts`, `vitest`, **node** environment
  (`apps/web/vitest.config.ts`). No `@testing-library/react` anywhere in this
  repo; `.tsx` files are not collected. **Do not write component tests, do not
  add dependencies.** Structural pattern:
  `apps/web/src/components/live/finish-guard.test.ts`.

### Design constraints to honor (quoted — you have not read these docs)

From the validated end-game artifact:

- « La séquence s'exécute sur l'écran de résumé existant, déclenchée à la
  validation de fin de partie par l'host — **pas d'écran supplémentaire, pas de
  route en plus**. »
- « Chaque appareil choisit sa variante avec `winnerId === me`. Même payload de
  fin de partie, deux orchestrations ; **le récap du vainqueur reste visible
  côté perdant**. »
- « **Toujours interruptible** — un tap n'importe où termine la séquence et
  affiche l'état final. […] jamais bloquante pour « Voir le classement ». »
- « Sous `prefers-reduced-motion: reduce`, **l'état de repos *est* l'image
  finale** : aucune animation n'est ajoutée, l'écran complet s'affiche
  immédiatement. Tout le reste passe par `transform` et `opacity` — zéro layout
  shift, **y compris le tracking de « VICTOIRE », obtenu en translatant chaque
  lettre**. »
  → **Never animate `letter-spacing`.** Each letter is its own `<span>` sliding
  from an offset to zero.
- « CSS keyframes + une petite horloge JS (`setTimeout`) déjà alimentée par les
  données de résumé. **Aucune dépendance d'animation à ajouter.** »
- The validated phase clocks:

  | Winner (total 3300 ms) | | Loser (total 3050 ms) | |
  |---|---|---|---|
  | 0 ms | bronze rays + portrait rise | 0 ms | the screen veils, ink tint |
  | 400 ms | « VICTOIRE » engraves, letter by letter | 250 ms | « DÉFAITE… » drops and bounces |
  | 1000 ms | the laurel wreath draws | 850 ms | the pawn tips over and lies down |
  | 1450 ms | confetti in the four camp colours | 1500 ms | the teasing line writes itself |
  | 1900 ms | recap and tiles cascade, counter 0 → N | 1800 ms | winner recap (fair-play) |
  | 2950 ms | the arcade buttons settle | 2150 ms | recap and tiles cascade |
  | | | 2750 ms | « Revanche ? » settles and breathes |

## Commands you will need

| Purpose            | Command                                                                                          | Expected on success |
|--------------------|--------------------------------------------------------------------------------------------------|---------------------|
| Install            | `pnpm install`                                                                                     | exit 0              |
| New unit tests     | `pnpm --filter @degommix/web test src/components/live/endgame.test.ts`                             | exit 0, all pass    |
| All web unit tests | `pnpm --filter @degommix/web test`                                                                 | exit 0              |
| Typecheck (repo)   | `pnpm typecheck`                                                                                   | exit 0              |
| Lint (repo)        | `pnpm lint`                                                                                        | exit 0              |
| Full suite         | `docker compose -f docker-compose.test.yml up -d` then `pnpm exec turbo run test --concurrency=1`   | exit 0              |
| E2E                | `docker compose -f docker-compose.test.yml up -d` then `pnpm test:e2e`                              | exit 0              |

Run everything from the repository root. `pnpm@11.13.1`, Node ≥ 22.

## Scope

**In scope** (the only files you may create or modify):

- `apps/web/src/components/live/endgame.ts` (create — pure helpers)
- `apps/web/src/components/live/endgame.test.ts` (create)
- `apps/web/src/components/live/endgame-decor.tsx` (create — the rays, laurel,
  confetti and tipped pawn SVG/markup, kept out of `summary.tsx` so that file
  stays readable)
- `apps/web/src/components/live/summary.tsx` (modify)
- `apps/web/src/components/live/live-screen.tsx` (modify — **one prop**)
- `apps/web/src/app/globals.css` (append a new block at the end)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- Any new route, page or modal. The sequence plays *on the existing summary*.
- `apps/web/src/components/rematch-button.tsx` — plan 002's component is
  correct; it is only *positioned* differently in the loser variant (primary
  instead of ghost). Pass `variant="primary"`; do not edit the component.
- `apps/web/src/lib/queries/**`, `packages/game-core/**`, `apps/ws-server/**`,
  `packages/db/**` — the sequence is derived entirely from props the summary
  already receives plus `viewerId`. Nothing new is fetched, persisted or
  broadcast.
- The e2e-asserted copy: « Résumé de partie », « Victoire », « vainqueur »,
  « village atteint en … », and the `summary-row-<username>` test ids. Byte
  identical.
- Sound, haptics, and any animation library (`framer-motion`, `gsap`, …). The
  artifact is explicit: « Aucune dépendance d'animation à ajouter. »
- `e2e/happy-path.spec.ts` — must keep passing **unmodified**.
- The abandoned-game branch (`state.winnerId === null`): it keeps its current
  static « Partie abandonnée » card with **no sequence at all**. A game nobody
  won has no winner variant and a defeat fanfare would be wrong. This is a
  decision, not an omission.

## Git workflow

- Branch: `feat/endgame-sequence` (repo convention `type/slug`).
- Conventional Commits in English. Suggested:
  1. `test(web): specify the endgame variant, teasing line and confetti seeding`
  2. `feat(web): animated two-variant endgame sequence on the summary screen`
- Do NOT push and do NOT open a PR unless the operator instructed it.

## The mechanism (decided after reading the code — do not substitute another)

One state variable in `Summary`:

```ts
const [phase, setPhase] = useState<'playing' | 'done'>('playing')
```

`'playing'` puts an `eg-play` class on the `<main>`; every animation in the new
CSS block is scoped to `.eg-play` and every keyframe **ends on the rest state**.
Removing the class therefore *is* "skip to the final image" — no per-element
cleanup, no forced reflow.

- **Auto-finish**: one `setTimeout(…, total)` in a `useEffect`, cleared on
  unmount. `total` is 3300 ms (winner) or 3050 ms (loser).
- **Interruptible**: `onClick` / `onKeyDown` on the `<main>` calls
  `setPhase('done')`. Clicks on the two action buttons still work because
  `setPhase` does not preventDefault and the buttons are above the decor layers
  (`pointer-events: none` on every `[data-eg-fx]` element).
- **Reduced motion**: handled **in CSS** — the new block ends with
  `@media (prefers-reduced-motion: reduce) { .eg-play * { animation: none !important; } }`.
  Because every rest state is the final image, the screen simply appears whole.
  There is **one** JS read of the media query, and only one: the counter roll
  (below) is a JS tween that has no CSS equivalent, so it is skipped when motion
  is reduced. That read happens inside a `useEffect` (post-hydration), never
  during render, so it cannot cause an SSR/hydration mismatch.
- **Counter roll 0 → N**: the tile renders `totalDegommages` on first paint
  (correct for SSR, correct with JS disabled, correct under reduced motion). An
  effect then — only when motion is allowed and `phase === 'playing'` — sets the
  displayed value to 0 and eases it up to N between 2280 ms and 3180 ms
  (winner) / 2480 ms and 3380 ms (loser). No flash is visible because the stat
  row is still inside its own `opacity: 0 → 1` cascade until ~2.2 s.
- **Determinism, no `Math.random()`**: the confetti geometry is seeded from
  `gameId` through a small FNV-1a hash + LCG in `endgame.ts`. React renders the
  same confetti on server and client and on every re-render, so there is no
  hydration warning and no reshuffle when the component re-renders.

## Steps

### Step 1: Confirm the ground truth

Run the drift check. Read in full: `summary.tsx`, `live-screen.tsx` lines
26–60 and 88–125, `rematch-button.tsx`, `globals.css` lines 560–589, and
`e2e/happy-path.spec.ts` lines 120–150.

**Verify**:
- `grep -rn "from './summary'" apps/web/src` → exactly one match
  (`live-screen.tsx:20`).
- `grep -n "RematchButton" apps/web/src/components/live/summary.tsx` → one
  match at line 116 (plan 002 already landed).
- `grep -rn "framer-motion\|gsap\|animejs" apps/web package.json` → no matches.
- `grep -n "@keyframes" apps/web/src/app/globals.css` → exactly one match
  (`water-squash`).
- `pnpm --filter @degommix/web test` → exit 0 (green baseline).

### Step 2 (TEST-FIRST): Specify the pure helpers

Create `apps/web/src/components/live/endgame.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ENDGAME_TEASES,
  ENDGAME_TIMINGS,
  confettiPieces,
  endgameVariant,
  pickTease,
} from './endgame'

describe('endgameVariant', () => {
  it('is « winner » for the winner', () => {
    expect(endgameVariant('u1', 'u1')).toBe('winner')
  })

  it('is « loser » for everybody else while there is a winner', () => {
    expect(endgameVariant('u1', 'u2')).toBe('loser')
  })

  it('is « none » when the game was abandoned', () => {
    expect(endgameVariant(null, 'u1')).toBe('none')
  })
})

describe('ENDGAME_TIMINGS', () => {
  it('matches the validated clocks', () => {
    expect(ENDGAME_TIMINGS.winner.total).toBe(3300)
    expect(ENDGAME_TIMINGS.loser.total).toBe(3050)
    expect(ENDGAME_TIMINGS.winner.counterAt).toBe(2280)
    expect(ENDGAME_TIMINGS.loser.counterAt).toBe(2480)
  })

  it('starts the counter before the sequence ends', () => {
    for (const timing of [ENDGAME_TIMINGS.winner, ENDGAME_TIMINGS.loser]) {
      expect(timing.counterAt).toBeLessThan(timing.total)
    }
  })
})

describe('pickTease', () => {
  it('offers four short lines', () => {
    expect(ENDGAME_TEASES).toHaveLength(4)
    for (const line of ENDGAME_TEASES) expect(line.length).toBeLessThanOrEqual(48)
  })

  it('uses the typographic apostrophe only', () => {
    for (const line of ENDGAME_TEASES) expect(line).not.toContain("'")
  })

  it('is deterministic for a given gameId', () => {
    expect(pickTease('abc-123')).toBe(pickTease('abc-123'))
  })

  it('always returns a line from the list', () => {
    for (let i = 0; i < 200; i++) expect(ENDGAME_TEASES).toContain(pickTease(`game-${i}`))
  })

  it('uses all four lines across 200 games', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(pickTease(`game-${i}`))
    expect(seen.size).toBe(4)
  })
})

describe('confettiPieces', () => {
  it('produces 24 pieces', () => {
    expect(confettiPieces('g1')).toHaveLength(24)
  })

  it('is deterministic for a given gameId — no hydration mismatch', () => {
    expect(confettiPieces('g1')).toEqual(confettiPieces('g1'))
  })

  it('differs between games', () => {
    expect(confettiPieces('g1')).not.toEqual(confettiPieces('g2'))
  })

  it('cycles the four camp colours', () => {
    const colours = new Set(confettiPieces('g1').map((p) => p.color))
    expect(colours).toEqual(
      new Set(['var(--asterix)', 'var(--obelix)', 'var(--caius)', 'var(--caligula)'])
    )
  })

  it('keeps every piece inside the viewport and on a sane clock', () => {
    for (const piece of confettiPieces('g1')) {
      expect(piece.leftPct).toBeGreaterThanOrEqual(4)
      expect(piece.leftPct).toBeLessThanOrEqual(96)
      expect(piece.durationMs).toBeGreaterThanOrEqual(1000)
      expect(piece.durationMs).toBeLessThanOrEqual(1420)
      expect(piece.delayMs).toBeGreaterThanOrEqual(1450)
      expect(piece.delayMs).toBeLessThanOrEqual(1830)
    }
  })
})
```

**Verify**: `pnpm --filter @degommix/web test src/components/live/endgame.test.ts`
→ **fails**, `./endgame` does not exist. Confirm the failure reason.

Commit: `test(web): specify the endgame variant, teasing line and confetti seeding`.

### Step 3: Create the pure helpers

Create `apps/web/src/components/live/endgame.ts`:

```ts
/**
 * Pure inputs of the end-of-game sequence played on the summary screen.
 * Everything here is deterministic on purpose: the confetti and the teasing
 * line are derived from `gameId`, so React renders the same thing on the server
 * and on the client (no hydration mismatch) and on every re-render (no
 * reshuffle mid-animation).
 */

export type EndgameVariant = 'winner' | 'loser' | 'none'

/**
 * Which orchestration this phone plays. Every device holds the same finished
 * state and picks its own variant — « none » when nobody won (an abandoned game
 * gets neither a fanfare nor a defeat).
 */
export function endgameVariant(winnerId: string | null, viewerId: string): EndgameVariant {
  if (winnerId === null) return 'none'
  return winnerId === viewerId ? 'winner' : 'loser'
}

/** The validated phase clocks, in milliseconds. */
export const ENDGAME_TIMINGS = {
  winner: { total: 3300, counterAt: 2280 },
  loser: { total: 3050, counterAt: 2480 },
} as const

/** How long the dégommage counter takes to roll from 0 to its final value. */
export const COUNTER_ROLL_MS = 900

/**
 * Shown under « DÉFAITE… ». Teasing, never humiliating, never about the person:
 * the line always leaves the door open to a rematch. No vocabulary borrowed
 * from the albums — same rule as the journal catalog.
 */
export const ENDGAME_TEASES = [
  'Le village est tombé. On remet ça ?',
  'Belle bagarre. La revanche est juste là.',
  'Cette fois-ci pour eux. La prochaine, on verra.',
  'Rien de perdu : les pions se remettent debout.',
] as const

/** FNV-1a over a string — small, fast, and stable across engines. */
function hashText(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Same line for the whole game, a different one from one game to the next. */
export function pickTease(gameId: string): string {
  const index = hashText(gameId) % ENDGAME_TEASES.length
  return ENDGAME_TEASES[index] ?? ENDGAME_TEASES[0]
}

/** One falling confetti piece, in the winner variant only. */
export interface ConfettiPiece {
  /** Horizontal start, as a percentage of the screen width. */
  readonly leftPct: number
  /** Horizontal drift over the fall, in pixels. */
  readonly driftPx: number
  /** Total rotation over the fall, in degrees. */
  readonly rotateDeg: number
  readonly durationMs: number
  readonly delayMs: number
  /** One of the four camp colours, as a CSS custom-property reference. */
  readonly color: string
  /** True for the round pieces — a third of them, for variety. */
  readonly round: boolean
}

const CAMP_COLORS = [
  'var(--asterix)',
  'var(--obelix)',
  'var(--caius)',
  'var(--caligula)',
] as const

const CONFETTI_COUNT = 24

/**
 * 24 deterministic pieces seeded by `gameId`. A plain LCG keeps this pure and
 * dependency-free; the ranges mirror the validated reference
 * (4–96 % across, ±40 px drift, ±330° spin, 1000–1420 ms fall, 1450–1830 ms
 * stagger, which lines up with the 1450 ms confetti phase).
 */
export function confettiPieces(gameId: string): readonly ConfettiPiece[] {
  let seed = hashText(gameId) || 1
  const next = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0x100000000
  }

  const pieces: ConfettiPiece[] = []
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    pieces.push({
      leftPct: Math.round((4 + next() * 92) * 100) / 100,
      driftPx: Math.round(next() * 80 - 40),
      rotateDeg: Math.round(next() * 660 - 330),
      durationMs: Math.round(1000 + next() * 420),
      delayMs: Math.round(1450 + next() * 380),
      color: CAMP_COLORS[i % CAMP_COLORS.length] ?? CAMP_COLORS[0],
      round: i % 3 === 0,
    })
  }
  return pieces
}

/** « VICTOIRE », one span per letter — the tracking is a translate, never letter-spacing. */
export const VICTORY_LETTERS = 'VICTOIRE'.split('')
```

**Verify**: `pnpm --filter @degommix/web test src/components/live/endgame.test.ts`
→ exit 0, 15 tests pass. If "uses all four lines across 200 games" fails, do not
change the lines — report it (the hash is spreading badly, which is a real
finding).

### Step 4: Add the sequence CSS

Append at the **end** of `apps/web/src/app/globals.css`. Do not modify any
existing rule.

```css
/**
 * End-of-game sequence — two variants (winner ~3.3 s, loser ~3.05 s) played on
 * the summary screen. Everything is scoped to `.eg-play`: removing that class
 * skips to the final image, because every keyframe ends on the rest state. That
 * is also why reduced motion needs nothing but a blanket `animation: none`.
 *
 * Only `transform` and `opacity` are animated — including the « VICTOIRE »
 * tracking, which slides each letter rather than animating `letter-spacing`
 * (that would reflow the whole line on every frame).
 */
.eg-root { position: relative; overflow-x: clip; }

[data-eg-fx] { pointer-events: none; }

.eg-rays {
  position: absolute;
  z-index: 0;
  top: 96px;
  left: 50%;
  width: 760px;
  height: 760px;
  margin: -380px 0 0 -380px;
  opacity: 0.85;
  background: repeating-conic-gradient(
    from 0deg at 50% 50%,
    color-mix(in srgb, var(--bronze) 20%, transparent) 0deg 7deg,
    transparent 7deg 22deg
  );
  -webkit-mask-image: radial-gradient(closest-side, #000 12%, rgba(0, 0, 0, 0.55) 42%, transparent 72%);
  mask-image: radial-gradient(closest-side, #000 12%, rgba(0, 0, 0, 0.55) 42%, transparent 72%);
  will-change: transform, opacity;
}

.eg-veil {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: radial-gradient(105% 78% at 50% 34%, transparent 28%, color-mix(in srgb, var(--ink) 20%, transparent) 100%);
}

.eg-confetti { position: absolute; inset: 0; z-index: 3; overflow: hidden; }
.eg-conf {
  position: absolute;
  top: -26px;
  left: var(--x);
  width: 7px;
  height: 11px;
  opacity: 0;
  border: 1px solid color-mix(in srgb, var(--ink) 45%, transparent);
  will-change: transform, opacity;
}
.eg-conf.round { border-radius: 50%; }

.eg-title { display: flex; justify-content: center; gap: 0.02em; }
.eg-title .l {
  display: inline-block;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 2.1rem;
  letter-spacing: 0.06em;
  color: var(--ink);
  will-change: transform, opacity;
}

.eg-defeat {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.8rem;
  letter-spacing: 0.12em;
  color: var(--ink-soft);
  text-align: center;
  will-change: transform, opacity;
}

.eg-laurel { display: block; margin: 0 auto; color: var(--bronze); }
.eg-laurel .arc { fill: none; stroke: currentColor; stroke-width: 3.5; stroke-linecap: round; }
.eg-laurel .leaf { fill: currentColor; transform-box: fill-box; transform-origin: 50% 100%; }

.eg-pawn { display: block; margin: 0 auto; transform-origin: 50% 100%; will-change: transform; }

.eg-tease { text-align: center; will-change: transform, opacity; }
.eg-fairplay { will-change: transform, opacity; }

.eg-anim { will-change: transform, opacity; }

@keyframes eg-rays-in { from { opacity: 0; transform: scale(0.6); } to { opacity: 0.85; transform: scale(1); } }
@keyframes eg-spin { to { transform: rotate(360deg); } }
@keyframes eg-rise { from { opacity: 0; transform: translate3d(0, 34px, 0) scale(0.9); } to { opacity: 1; transform: none; } }
@keyframes eg-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes eg-engrave {
  0% { opacity: 0; transform: translate3d(calc(var(--i) * 10px), 0, 0); }
  45% { opacity: 1; }
  100% { opacity: 1; transform: translate3d(0, 0, 0); }
}
@keyframes eg-trace { to { stroke-dashoffset: 0; } }
@keyframes eg-leaf { from { opacity: 0; transform: scale(0.1); } to { opacity: 1; transform: scale(1); } }
@keyframes eg-drop {
  0% { opacity: 0; transform: translate3d(0, -48px, 0); }
  52% { opacity: 1; transform: translate3d(0, 7px, 0); }
  74% { transform: translate3d(0, -4px, 0); }
  88% { transform: translate3d(0, 2px, 0); }
  100% { opacity: 1; transform: translate3d(0, 0, 0); }
}
@keyframes eg-topple {
  0% { transform: rotate(0deg); }
  35% { transform: rotate(-7deg); }
  78% { transform: rotate(84deg); }
  88% { transform: rotate(78deg); }
  100% { transform: rotate(81deg); }
}
@keyframes eg-cascade { from { opacity: 0; transform: translate3d(0, 20px, 0); } to { opacity: 1; transform: none; } }
@keyframes eg-pose { from { opacity: 0; transform: translate3d(0, 16px, 0) scale(0.97); } to { opacity: 1; transform: none; } }
@keyframes eg-breath { 0%, 100% { transform: none; } 40% { transform: translate3d(0, -3px, 0); } }
@keyframes eg-fall {
  0% { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0; }
  12% { opacity: 1; }
  100% { transform: translate3d(var(--dx), 720px, 0) rotate(var(--rot)); opacity: 0; }
}

/* ---- Winner, total 3300 ms ---- */
.eg-play.winner .eg-rays {
  animation: eg-rays-in 700ms cubic-bezier(0.16, 0.84, 0.44, 1) 0ms both,
    eg-spin 26s linear infinite;
}
.eg-play.winner .eg-hero { animation: eg-rise 620ms cubic-bezier(0.18, 0.9, 0.34, 1.08) 60ms both; }
.eg-play.winner .eg-title .l {
  animation: eg-engrave 700ms cubic-bezier(0.2, 0.75, 0.3, 1) calc(400ms + var(--i0) * 26ms) both;
}
.eg-play.winner .eg-subtitle { animation: eg-fade 400ms ease 900ms both; }
.eg-play.winner .eg-laurel .arc {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: eg-trace 620ms cubic-bezier(0.4, 0, 0.2, 1) 1000ms both;
}
.eg-play.winner .eg-laurel .leaf {
  animation: eg-leaf 260ms cubic-bezier(0.2, 1.4, 0.4, 1) calc(1080ms + var(--i) * 42ms) both;
}
.eg-play.winner .eg-conf { animation: eg-fall var(--dur) linear var(--del) both; }
.eg-play.winner .eg-recap-row { animation: eg-cascade 380ms cubic-bezier(0.2, 0.85, 0.35, 1) calc(1900ms + var(--i) * 80ms) both; }
.eg-play.winner .eg-tile { animation: eg-cascade 400ms cubic-bezier(0.2, 0.85, 0.35, 1) calc(2180ms + var(--i) * 110ms) both; }
.eg-play.winner .eg-action { animation: eg-pose 340ms cubic-bezier(0.2, 0.9, 0.3, 1.05) calc(2950ms + var(--i) * 110ms) both; }

/* ---- Loser, total 3050 ms ---- */
.eg-play.loser .eg-veil { animation: eg-fade 520ms ease 0ms both; }
.eg-play.loser .eg-defeat { animation: eg-drop 620ms cubic-bezier(0.3, 0.7, 0.4, 1) 250ms both; }
.eg-play.loser .eg-subtitle { animation: eg-fade 400ms ease 760ms both; }
.eg-play.loser .eg-pawn { animation: eg-topple 700ms cubic-bezier(0.35, 0.05, 0.3, 1) 850ms both; }
.eg-play.loser .eg-tease { animation: eg-cascade 420ms cubic-bezier(0.2, 0.85, 0.35, 1) 1500ms both; }
.eg-play.loser .eg-fairplay { animation: eg-cascade 420ms cubic-bezier(0.2, 0.85, 0.35, 1) 1800ms both; }
.eg-play.loser .eg-recap-row { animation: eg-cascade 360ms cubic-bezier(0.2, 0.85, 0.35, 1) calc(2150ms + var(--i) * 70ms) both; }
.eg-play.loser .eg-tile { animation: eg-cascade 380ms cubic-bezier(0.2, 0.85, 0.35, 1) calc(2380ms + var(--i) * 100ms) both; }
.eg-play.loser .eg-action {
  animation: eg-pose 320ms cubic-bezier(0.2, 0.9, 0.3, 1.05) calc(2750ms + var(--i) * 90ms) both,
    eg-breath 900ms ease calc(3100ms + var(--i) * 90ms) 1 both;
}

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

**Verify**: `grep -c "@keyframes eg-" apps/web/src/app/globals.css` → `12`.

### Step 5: Create the decor components

Create `apps/web/src/components/live/endgame-decor.tsx`. It holds the purely
decorative markup so `summary.tsx` stays readable. Every element is
`aria-hidden` and carries `data-eg-fx` (which the CSS turns into
`pointer-events: none`).

```tsx
import type { CSSProperties } from 'react'
import type { ConfettiPiece } from './endgame'

/** Rotating bronze rays behind the winner header. */
export function EndgameRays() {
  return <span className="eg-rays" data-eg-fx aria-hidden="true" />
}

/** Ink veil that settles over the loser's screen. */
export function EndgameVeil() {
  return <span className="eg-veil" data-eg-fx aria-hidden="true" />
}

/** 24 falling pieces in the four camp colours (winner variant only). */
export function EndgameConfetti({ pieces }: { pieces: readonly ConfettiPiece[] }) {
  return (
    <span className="eg-confetti" data-eg-fx aria-hidden="true">
      {pieces.map((piece, index) => (
        <i
          key={index}
          className={piece.round ? 'eg-conf round' : 'eg-conf'}
          style={
            {
              '--x': `${piece.leftPct}%`,
              '--dx': `${piece.driftPx}px`,
              '--rot': `${piece.rotateDeg}deg`,
              '--dur': `${piece.durationMs}ms`,
              '--del': `${piece.delayMs}ms`,
              background: piece.color,
            } as CSSProperties
          }
        />
      ))}
    </span>
  )
}

const LEAF_ANGLES = [168, 190, 212, 234, 256, 278] as const

/**
 * Laurel wreath: two arcs drawn with `stroke-dashoffset`, then twelve leaves
 * popping in pairs. `pathLength="1"` normalises the dash maths so the same
 * `stroke-dasharray: 1` works for both arcs.
 */
export function EndgameLaurel() {
  return (
    <svg
      className="eg-laurel"
      data-eg-fx
      aria-hidden="true"
      width="120"
      height="120"
      viewBox="0 0 160 160"
    >
      <path className="arc" pathLength="1" d="M94.8 149.4A71 71 0 0 1 9.7 70.1" />
      <path className="arc" pathLength="1" d="M65.2 149.4A71 71 0 0 0 150.3 70.1" />
      {LEAF_ANGLES.map((angle, index) => (
        <g key={`l${angle}`} transform={`rotate(${angle} 80 80)`}>
          <g className="leaf" style={{ '--i': index } as CSSProperties}>
            <ellipse cx="80" cy="9" rx="5.4" ry="11.5" transform="rotate(-30 80 9)" />
          </g>
        </g>
      ))}
      {LEAF_ANGLES.map((angle, index) => (
        <g key={`r${angle}`} transform={`rotate(${-angle} 80 80)`}>
          <g className="leaf" style={{ '--i': index } as CSSProperties}>
            <ellipse cx="80" cy="9" rx="5.4" ry="11.5" transform="rotate(30 80 9)" />
          </g>
        </g>
      ))}
    </svg>
  )
}

/** The loser's pawn, which tips over and lies down. */
export function EndgamePawn() {
  return (
    <svg className="eg-pawn" data-eg-fx aria-hidden="true" width="52" height="64" viewBox="0 0 50 62">
      <ellipse cx="25" cy="57" rx="15" ry="4.5" fill="var(--ink)" opacity="0.18" />
      <path
        d="M25 6c-6 0-10 4-10 9 0 3 1 5 3 7-4 3-6 8-6 14v8h26v-8c0-6-2-11-6-14 2-2 3-4 3-7 0-5-4-9-10-9Z"
        fill="var(--bronze)"
        stroke="var(--ink)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect x="10" y="44" width="30" height="8" rx="3" fill="var(--bronze)" stroke="var(--ink)" strokeWidth="2.5" />
    </svg>
  )
}
```

### Step 6: Wire the sequence into `Summary`

Rewrite `apps/web/src/components/live/summary.tsx`. Keep every existing string,
every existing `data-testid`, and the existing DOM order; the changes are:

1. a new required `viewerId` prop;
2. `phase` state + the auto-finish timer + the tap-to-skip handler;
3. an `eg-*` class and a `--i` index on each cascading element;
4. the two new decorative blocks (winner header / loser header);
5. the counter roll on the « Dégommages » tile.

Target shape (the parts that change; everything not shown stays byte-identical
to the current file):

```tsx
'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { GameState } from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { RematchButton } from '@/components/rematch-button'
import { Button } from '@/components/ui/button'
import { CharacterBadge } from '@/components/ui/character-badge'
import { Pill } from '@/components/ui/pill'
import { StatTile } from '@/components/ui/stat-tile'
import { CHARACTER_META } from '@/lib/characters'
import { formatChrono } from '@/lib/chrono'
import {
  COUNTER_ROLL_MS,
  ENDGAME_TIMINGS,
  VICTORY_LETTERS,
  confettiPieces,
  endgameVariant,
  pickTease,
} from './endgame'
import {
  EndgameConfetti,
  EndgameLaurel,
  EndgamePawn,
  EndgameRays,
  EndgameVeil,
} from './endgame-decor'
import { displayName, type NameMap } from './types'

interface SummaryProps {
  gameId: string
  state: GameState
  names: NameMap
  /** Who is looking — decides which end-of-game variant this phone plays. */
  viewerId: string
  startedAt: string | null
  endedAt: string | null
}

const FORMAT_LABELS = { 2: '1v1', 3: '3J', 4: '4J' } as const

/**
 * Inline end-of-game recap (same route, design §5.2 Résumé) plus the validated
 * end-of-game sequence: a winner orchestration and a loser one, chosen with
 * `winnerId === viewerId`, both playing on this very screen. The rest state is
 * the final image, so a tap (or `prefers-reduced-motion`) simply skips to it.
 */
export function Summary({ gameId, state, names, viewerId, startedAt, endedAt }: SummaryProps) {
  const router = useRouter()

  const winner = state.winnerId ? state.players[state.winnerId] : undefined
  const durationSec = /* unchanged */ null as number | null
  const totalDegommages = Object.values(state.players).reduce((sum, p) => sum + p.degommages, 0)

  const variant = endgameVariant(state.winnerId, viewerId)
  const timing = variant === 'loser' ? ENDGAME_TIMINGS.loser : ENDGAME_TIMINGS.winner
  const [phase, setPhase] = useState<'playing' | 'done'>(variant === 'none' ? 'done' : 'playing')
  const [shownDegommages, setShownDegommages] = useState(totalDegommages)
  const confetti = useMemo(() => confettiPieces(gameId), [gameId])

  // Auto-finish: the sequence lasts `timing.total`; after that the screen is at
  // rest anyway (every keyframe ends on the final image), so dropping the class
  // is only housekeeping.
  useEffect(() => {
    if (phase !== 'playing') return
    const id = setTimeout(() => setPhase('done'), timing.total)
    return () => clearTimeout(id)
  }, [phase, timing.total])

  // Counter roll 0 → N. The tile already renders the final value, so this only
  // ever *starts* from 0 when motion is allowed; under reduced motion nothing
  // happens and the number is simply correct from the first paint. The media
  // query is read in an effect (post-hydration) so it cannot desync SSR.
  useEffect(() => {
    if (phase !== 'playing') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setShownDegommages(0)
    let frame = 0
    const start = setTimeout(() => {
      const t0 = performance.now()
      const step = (now: number): void => {
        const k = Math.min(1, (now - t0) / COUNTER_ROLL_MS)
        setShownDegommages(Math.round(totalDegommages * (1 - Math.pow(1 - k, 3))))
        if (k < 1) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }, timing.counterAt)
    return () => {
      clearTimeout(start)
      cancelAnimationFrame(frame)
      setShownDegommages(totalDegommages)
    }
  }, [phase, timing.counterAt, totalDegommages])

  const rootClass = [
    'eg-root mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-6',
    phase === 'playing' ? `eg-play ${variant}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <main
      className={rootClass}
      onClick={() => setPhase('done')}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') setPhase('done')
      }}
    >
      {variant === 'winner' ? <EndgameRays /> : null}
      {variant === 'loser' ? <EndgameVeil /> : null}
      {variant === 'winner' ? <EndgameConfetti pieces={confetti} /> : null}

      <h1 className="s-title relative">Résumé de partie</h1>

      {winner ? (
        <section className="card eg-hero relative overflow-hidden p-4">
          {/* …the existing winner card, unchanged… */}
        </section>
      ) : (
        <section className="card flex flex-col items-start gap-2 p-4">
          {/* …the existing abandoned card, unchanged… */}
        </section>
      )}

      {variant === 'winner' ? (
        <div className="relative flex flex-col items-center gap-1">
          <EndgameLaurel />
          <p className="eg-title m-0" aria-label="Victoire">
            {VICTORY_LETTERS.map((letter, index) => (
              <span
                key={`${letter}${index}`}
                className="l"
                aria-hidden="true"
                style={
                  { '--i': index - (VICTORY_LETTERS.length - 1) / 2, '--i0': index } as CSSProperties
                }
              >
                {letter}
              </span>
            ))}
          </p>
        </div>
      ) : null}

      {variant === 'loser' ? (
        <div className="relative flex flex-col items-center gap-2">
          <p className="eg-defeat m-0">Défaite…</p>
          <EndgamePawn />
          <p className="eg-tease m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
            {pickTease(gameId)}
          </p>
          {winner ? (
            <p
              className="eg-fairplay card m-0 w-full p-2 text-center text-xs"
              style={{ color: 'var(--ink-soft)', borderColor: 'var(--bronze)' }}
            >
              {displayName(names, winner.userId)} remporte la partie
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="relative flex flex-col gap-2">
        {state.seats.map((userId, index) => {
          /* …unchanged body… */
          return (
            <div
              key={userId}
              className="card eg-recap-row flex items-center gap-3 p-3"
              style={{ '--i': index, ...(isWinner ? { borderColor: 'var(--bronze)' } : {}) } as CSSProperties}
              data-testid={`summary-row-${displayName(names, userId)}`}
            >
              {/* …unchanged… */}
            </div>
          )
        })}
      </section>

      <div className="stat-row relative">
        <span className="eg-tile contents" style={{ '--i': 0 } as CSSProperties}>
          <StatTile icon="timer" label="Durée" value={durationSec !== null ? formatChrono(durationSec) : '—'} />
        </span>
        <span className="eg-tile contents" style={{ '--i': 1 } as CSSProperties}>
          <StatTile icon="sword" label="Dégommages" value={shownDegommages} />
        </span>
        <span className="eg-tile contents" style={{ '--i': 2 } as CSSProperties}>
          <StatTile icon="flag" label="Format" value={FORMAT_LABELS[state.format]} />
        </span>
      </div>

      <div className="relative mt-auto flex flex-col gap-2">
        {variant === 'loser' ? (
          <>
            <span className="eg-action contents" style={{ '--i': 0 } as CSSProperties}>
              <RematchButton finishedGameId={gameId} variant="primary" />
            </span>
            <span className="eg-action contents" style={{ '--i': 1 } as CSSProperties}>
              <Button variant="ghost" onClick={() => router.push('/classement')}>
                Voir le classement
              </Button>
            </span>
          </>
        ) : (
          <>
            <span className="eg-action contents" style={{ '--i': 0 } as CSSProperties}>
              <Button onClick={() => router.push('/classement')}>Voir le classement</Button>
            </span>
            <span className="eg-action contents" style={{ '--i': 1 } as CSSProperties}>
              <RematchButton finishedGameId={gameId} variant="ghost" />
            </span>
          </>
        )}
      </div>
    </main>
  )
}
```

Six things you must get right:

1. **`display: contents` wrappers.** `.stat-tile` uses `flex: 1` inside
   `.stat-row`; wrapping it in a normal `<span>` would break the layout. The
   `contents` utility removes the wrapper box while keeping it as an animation
   and `--i` carrier. Verify visually in Step 8; if `contents` misbehaves in
   your browser, move the `eg-tile` class onto `StatTile`'s own root instead —
   which means adding an optional `className` prop to `StatTile`, and that is a
   **STOP condition** (it widens the scope to a shared UI component).
2. **`durationSec` and the winner card body are unchanged.** The `/* unchanged */`
   markers above are shorthand for "copy the current file"; do not literally
   write `null as number | null`.
3. **Keep the abandoned branch static.** When `variant === 'none'`, `phase`
   starts at `'done'`, so no class, no timers, no decor. The existing card
   renders exactly as today.
4. **The `<main>` click handler must not swallow button clicks.** It does not:
   `setPhase` is a state update, the event still reaches (and is handled by) the
   buttons. Do not add `preventDefault` or `stopPropagation`.
5. **The `<main>` gets no `role` and no `tabIndex`.** It is not a control; the
   `onKeyDown` is a courtesy for keyboard users who happen to focus inside it.
   Do not add `role="button"` to a `<main>` — it would break the landmark.
6. **The decorative layers sit at `z-index` 0 and 3; the content blocks each get
   `relative`** so they paint above the rays and below the confetti. That is why
   `relative` appears on `h1`, the recap `section`, `.stat-row` and the action
   column above.

### Step 7: Pass `viewerId` from `LiveScreen`

In `apps/web/src/components/live/live-screen.tsx`, add one prop:

```tsx
      <Summary
        gameId={gameId}
        state={state}
        names={names}
        viewerId={viewerId}
        startedAt={startedAt ?? fallbackStartedAt}
        endedAt={journal.lastEventAt ?? fallbackEndedAt}
      />
```

Change nothing else in that file.

**Verify**:
- `pnpm typecheck` → exit 0.
- `pnpm lint` → exit 0.
- `pnpm --filter @degommix/web test` → exit 0.
- `grep -n "letter-spacing" apps/web/src/app/globals.css` → matches only inside
  static rules, **never inside a `@keyframes eg-` block**.

Commit: `feat(web): animated two-variant endgame sequence on the summary screen`.

### Step 8: Full verification

From the repo root:

1. `pnpm --filter @degommix/web test` → exit 0.
2. `pnpm typecheck` → exit 0.
3. `pnpm lint` → exit 0.
4. `docker compose -f docker-compose.test.yml up -d` then
   `pnpm exec turbo run test --concurrency=1` → exit 0 (or state Docker was
   unavailable).
5. `docker compose -f docker-compose.test.yml up -d` then `pnpm test:e2e` →
   exit 0, **with `e2e/happy-path.spec.ts` unmodified**. This run exercises both
   variants (p1 loses, p2 wins) and its `13-resume` screenshot is a free visual
   record — look at it.
6. `git status --porcelain` → only the in-scope files.

Paste the actual tail of each command's output.

### Step 9: Visual verification (required — this is a 3-second animation)

Isolated stack, own database and ports:

```bash
docker run -d --name degommix-plan012 \
  -e POSTGRES_USER=degommix -e POSTGRES_PASSWORD=degommix -e POSTGRES_DB=degommix_test \
  -e LANG=en_US.utf8 -e POSTGRES_INITDB_ARGS="--locale=en_US.UTF-8" \
  -p 54403:5432 postgres:16

export DATABASE_URL=postgres://degommix:degommix@localhost:54403/degommix_test
export BETTER_AUTH_SECRET=plan012-secret-0123456789-abcdefghij
export BETTER_AUTH_URL=http://localhost:3012
export NEXT_PUBLIC_WS_URL=http://localhost:4013
export WEB_ORIGIN=http://localhost:3012
export PORT=4013

pnpm --filter @degommix/db db:migrate
pnpm --filter @degommix/ws-server exec tsx src/index.ts &     # ws-server on :4013
pnpm --filter @degommix/web exec next dev -p 3012             # web on :3012
```

(Variable names and meanings from `.env.example`; the ws-server reads no `.env`
file.)

Two browser profiles at 390 × 844 (`e2e/playwright.config.ts`), accounts A and B
already friends. Play a 1v1 to the end (« Fin de partie » → « Village atteint »
→ host validates), then check:

1. **Winner phone**: rays appear and turn slowly, the portrait rises, VICTOIRE
   engraves letter by letter, the laurel draws, confetti falls in four colours,
   the recap rows and tiles cascade, the « Dégommages » tile rolls 0 → N, and the
   two buttons settle last. Total ≈ 3.3 s.
2. **Loser phone, at the same moment**: the screen veils, DÉFAITE… drops and
   bounces, the pawn tips over, a teasing line writes itself, the fair-play band
   names the winner, the cascade runs, « Revanche ? » (the primary
   `RematchButton`) settles and breathes once. Total ≈ 3.05 s.
   - **Expected**: the winner's recap row is still fully readable on this phone.
3. **Interruption**: replay the flow and tap anywhere at ~1 s.
   - **Expected**: the screen jumps to its complete final state, instantly. No
     half-faded element, no stuck confetti, the counter shows the final number.
4. **Buttons during the sequence**: replay and tap « Voir le classement » at
   ~1.5 s.
   - **Expected**: it navigates. The sequence is never blocking.
5. **Reduced motion** (DevTools → Rendering → Emulate CSS
   `prefers-reduced-motion: reduce`): replay the flow.
   - **Expected**: the finished screen appears complete and immediately, no
     confetti, no movement of any kind, and the counter shows the final number
     from the first frame.
6. **Layout**: at every moment of the sequence, no horizontal scrollbar and no
   vertical jump of the content below the header.
7. **Dark theme**: repeat check 1 with the dark theme on. The rays, the ink
   veil, the confetti and the laurel must all still read.
8. **Abandoned game**: play a game and end it with « Arrêter la partie » instead
   of « Village atteint ».
   - **Expected**: the « Partie abandonnée » card, with **no animation at all**,
     exactly as today.

Screenshots to attach: `plan012-winner-mid.png` (captured during the engraving),
`plan012-winner-final.png`, `plan012-loser-mid.png`, `plan012-loser-final.png`,
`plan012-reduced-motion.png`, `plan012-dark.png`, `plan012-aborted.png`.

Tear down: `docker rm -f degommix-plan012`.

## Test plan

Pure TypeScript, `vitest`, node environment, co-located. Structural pattern:
`apps/web/src/components/live/finish-guard.test.ts`.

`apps/web/src/components/live/endgame.test.ts` covers:

- `endgameVariant`: winner / loser / none (abandoned).
- `ENDGAME_TIMINGS`: the validated 3300 and 3050 ms totals, the counter start
  times, and that the counter starts before the sequence ends.
- `pickTease`: four lines, each ≤ 48 characters, typographic apostrophe only,
  determinism per `gameId`, always in the list, all four used across 200 games.
- `confettiPieces`: 24 pieces, deterministic per `gameId` (this is the
  hydration-safety test), different across games, all four camp colours, and
  every geometric/timing value inside its documented range.

No component test is added (no `@testing-library/react` in this repo). The
rendering is covered by `pnpm typecheck`, the unmodified e2e happy path — which
runs **both** variants — and the manual pass in Step 9.

Verification: `pnpm --filter @degommix/web test src/components/live/endgame.test.ts`
→ exit 0, 15 tests pass.

## Done criteria

Machine-checkable unless marked MANUAL. ALL must hold:

- [ ] `pnpm --filter @degommix/web test src/components/live/endgame.test.ts` exits 0 (15 tests)
- [ ] `pnpm --filter @degommix/web test` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm exec turbo run test --concurrency=1` exits 0 with the test DB up (or the report states Docker was unavailable)
- [ ] `pnpm test:e2e` exits 0 **with `e2e/happy-path.spec.ts` unmodified** (`git diff --name-only` must not list it)
- [ ] `grep -c "@keyframes eg-" apps/web/src/app/globals.css` returns `12`
- [ ] `grep -n "letter-spacing" apps/web/src/app/globals.css` shows no occurrence inside any `@keyframes eg-` block
- [ ] `grep -rn "Math.random" apps/web/src/components/live/` returns no matches
- [ ] `grep -rn "framer-motion\|gsap\|animejs" apps/web/package.json pnpm-lock.yaml` returns no new matches
- [ ] `grep -c "matchMedia" apps/web/src/components/live/summary.tsx` returns `1` (the counter roll, and nothing else)
- [ ] `grep -n "Résumé de partie\|Victoire\|vainqueur" apps/web/src/components/live/summary.tsx` still matches the e2e-asserted copy
- [ ] `git diff --name-only e772284..HEAD` lists only files from the "In scope" list
- [ ] `git status --porcelain` shows no modification outside the in-scope list
- [ ] `plans/README.md` row for 012 added/updated
- [ ] **MANUAL**: Step 9 performed, its 8 checks reported one by one, with the seven screenshots attached. Checks 3 (interruption), 5 (reduced motion) and 8 (abandoned game) must be reported explicitly.

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts — the
  codebase drifted since commit `e772284`. In particular, if `summary.tsx` no
  longer uses `RematchButton` (plan 002) or if a `live-actions` class from plan
  009 has appeared in it, re-read before continuing: those plans were in flight
  when this one was written and 009 targets `live-screen.tsx`, **not** the
  summary. If 009 did land on the summary, its bottom padding and this plan's
  action animations touch the same element and the interaction must be checked,
  not assumed.
- Making the stat tiles cascade appears to require adding a `className` prop to
  `apps/web/src/components/ui/StatTile` (or to `Button`, `Pill`,
  `CharacterBadge`). Those are shared UI primitives used across the whole app;
  widening their API for one screen is out of scope. Report instead.
- `pnpm test:e2e` fails on `toBeVisible()` for « Résumé de partie »,
  « Victoire », or a `summary-row-*` test id. That means an element is being
  left at `opacity: 0` outside an animation, which is the exact failure mode
  this plan is designed to avoid.
- React logs a hydration mismatch on the summary. The confetti and the teasing
  line are seeded from `gameId` precisely to prevent that; a mismatch means
  something non-deterministic slipped into render.
- You conclude the sequence needs a new route, a new event, a payload field, or
  a DB column. It needs none: everything comes from the finished `GameState`
  plus `viewerId`.
- Any step's verification fails twice after a reasonable fix attempt.
- The assumption "every keyframe ends on the rest state, so removing `.eg-play`
  is a valid skip-to-end" turns out to be false for some element you added.

## Maintenance notes

For whoever owns this code next:

- **What a reviewer should scrutinize**: (1) that no keyframe animates anything
  other than `transform`, `opacity` and `stroke-dashoffset` — a `width`,
  `height`, `margin` or `letter-spacing` frame would reflow the page 60 times a
  second on a phone; (2) that every animated element's *rest* state is its
  final state, which is what makes both the tap-to-skip and the reduced-motion
  path free; (3) that `matchMedia` appears exactly once and only inside an
  effect; (4) that the abandoned-game branch still animates nothing.
- **The two clocks are data** (`ENDGAME_TIMINGS`) but the CSS delays are
  literals. If a phase is retimed, both must move together — the test asserting
  `counterAt < total` is the only automated guard, and it is a weak one. A
  future refactor could drive the delays from CSS custom properties set from
  `ENDGAME_TIMINGS`; it was not done here because it would put six more inline
  custom properties on the root for no visible gain.
- **The teasing lines are the riskiest copy in the app.** They are read by the
  person who just lost, at a table, out loud. If any of them ever lands wrong,
  replace the line rather than removing the feature — and keep the rule: about
  the game, never about the player, always leaving a rematch open.
- **Interaction with plan 011** (« dégommage hit animation »): none at runtime —
  011 animates the live roster cards, and `live-screen.tsx:99-109` replaces the
  live screen entirely with `<Summary>` once the state is `finished`, so the two
  can never run at the same time. They do both append a block to the end of
  `globals.css`; if both are in flight expect a trivial merge conflict there and
  keep both blocks. Class prefixes (`hit-` vs `eg-`) were chosen not to collide.
- **Deferred on purpose**: no replay button for the sequence (it plays once,
  when the game ends — the artifact's demo page has one only because it is a
  demo), no per-player "skip animations" setting, no sound.
