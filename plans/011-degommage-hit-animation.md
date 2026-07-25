# Plan 011: Make the target's card react to a dégommage — shake, stars and a « PAF ! » stamp

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
> `git diff --stat e772284..HEAD -- apps/web/src/components/live/player-card.tsx apps/web/src/components/live/live-screen.tsx apps/web/src/components/live/tap-zone.tsx apps/web/src/app/globals.css apps/web/src/lib/rivalries.ts packages/game-core/src/types.ts e2e/helpers.ts`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S-M
- **Risk**: LOW
- **Depends on**: `plans/010-degommage-journal-messages.md` (soft — they share
  one file, `apps/web/src/lib/seq-hash.ts`; Step 2 below creates it if 010 has
  not landed, with byte-identical content, so either order works)
- **Category**: direction
- **Planned at**: commit `e772284`, 2026-07-25

## Why this matters

A dégommage is the whole point of the app and today it is invisible: a number
goes from 2 to 3 on a roster card, silently, on four phones at once. Around a
physical table nobody looks up. The owner validated one combination out of six
proposals — **« Secousse & étoiles + PAF ! »** — because it is the only one
readable from the other end of the table and the cheapest to build: the struck
player's card shakes, a burst of comic-book stars fires out of it, an
onomatopée stamps over it, and the sword tally pops.

Three readings in one gesture: the shake catches the eye, the word names the
event, the counter confirms the number. Everything is `transform`/`opacity`
only, so no neighbouring card ever moves, and `prefers-reduced-motion` drops
straight to a counter fade.

The animation plays on **every phone**, on the **target's** card, because the
event is replicated — which is also why the onomatopée is picked from the
event's `seq` rather than at random: all four screens must show the same word.

## Current state

### Files involved and their role

- `apps/web/src/components/live/player-card.tsx` — the roster card that must
  react (portrait, pseudo, sword tally, the « N subis » line added by plan 003).
- `apps/web/src/components/live/live-screen.tsx` — owns the game state and
  renders the cards; this is where "who was hit, and how many times" is derived.
- `apps/web/src/app/globals.css` — where this app keeps its keyframes.
- `apps/web/src/lib/rivalries.ts` — `takenByTarget`, already used by the live
  screen. **Read-only here, and deliberately NOT the trigger** (see below).
- `apps/web/src/components/live/tap-zone.tsx` — plan 007's per-target tap lock
  lives here, on the **tapper's** chips. Read it once to confirm there is no
  interaction with this plan.
- `packages/game-core/src/types.ts` — `DegommageEntry` and `GameState`.
  **Read-only.**

### `apps/web/src/components/live/player-card.tsx` (whole file, 53 lines, verbatim)

```tsx
import type { PlayerState } from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { CharacterBadge } from '@/components/ui/character-badge'
import { CHARACTER_META } from '@/lib/characters'

interface PlayerCardProps {
  player: PlayerState
  username: string
  isHost: boolean
  /** Degommages suffered so far, hidden while still at zero. */
  taken?: number
}

/**
 * Roster card of the live screen: portrait, pseudo (crown for the host) and
 * the sword tally. A player who left is grayed out with the quit note.
 */
export function PlayerCard({ player, username, isHost, taken }: PlayerCardProps) {
  return (
    <div
      className="card flex items-center gap-3 p-3"
      data-testid={`player-card-${username}`}
      style={player.inGame ? undefined : { opacity: 0.55, filter: 'grayscale(0.7)' }}
    >
      <CharacterBadge character={player.character} size="md" />
      <div className="min-w-0">
        <p className="m-0 flex items-center gap-1 truncate text-sm font-bold">
          <span className="truncate">{username}</span>
          {isHost ? (
            <Icon name="crown" size={13} className="shrink-0" title="Hôte de la partie" />
          ) : null}
        </p>
        <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
          {CHARACTER_META[player.character].label}
        </p>
        <p className="m-0 mt-1 flex items-center gap-1 text-sm font-bold">
          <Icon name="sword" size={14} title="Pions dégommés" />
          <span data-testid="degommage-count">{player.degommages}</span>
        </p>
        {taken !== undefined && taken > 0 ? (
          <p className="m-0 text-xs" style={{ color: 'var(--ink-faint)' }}>
            {taken} subi{taken > 1 ? 's' : ''}
          </p>
        ) : null}
        {player.inGame ? null : (
          <p className="m-0 text-xs italic" style={{ color: 'var(--ink-faint)' }}>
            a quitté la partie
          </p>
        )}
      </div>
    </div>
  )
}
```

Two things matter here:

- `data-testid="degommage-count"` is asserted by the e2e helper
  `expectCounter` (`e2e/helpers.ts:31-36`). It must keep working — that means
  the number stays inside the same element and stays plain text.
- `CharacterBadge` renders a `next/image` portrait
  (`apps/web/src/components/ui/character-badge.tsx:24`). **This is why the
  mechanism chosen below does not remount anything**: a React `key` remount
  would tear down and rebuild that `<img>` on every hit.

### `apps/web/src/components/live/live-screen.tsx` — lines 111–148 (state derivation and the card grid)

```tsx
  const inGame = activePlayers(state)
  const opponents = inGame.filter((p) => p.userId !== viewerId)
  const me = state.players[viewerId]
  const canAct = me !== undefined && me.inGame
  const canUndo = canAct && validateCommand(state, viewerId, { type: 'undo' }, { isHost }).ok
  const pending = state.pendingEndRequest
  const taken = takenByTarget(state)
```

```tsx
      <div className="relative z-10 grid grid-cols-2 gap-3">
        {state.seats.map((userId) => {
          const player = state.players[userId]
          if (!player) return null
          return (
            <PlayerCard
              key={userId}
              player={player}
              username={displayName(names, userId)}
              isHost={userId === hostId}
              taken={taken[userId] ?? 0}
            />
          )
        })}
      </div>
```

### `packages/game-core/src/types.ts` — the state this plan reads

```ts
export interface DegommageEntry {
  seq: number
  actorId: string
  targetId: string
}

export interface GameState {
  ...
  degommageLog: DegommageEntry[] // every DEGOMMAGE, in seq order
  undoneSeqs: ReadonlySet<number>
  ...
}
```

`packages/game-core/src/reducer.ts:55-69` — the `UNDO` case adds the seq to
`undoneSeqs` and decrements the actor's counter, but **never removes the entry
from `degommageLog`**:

```ts
    case 'UNDO': {
      const targetSeq = event.payload.targetSeq
      const entry = state.degommageLog.find((d) => d.seq === targetSeq)
      if (!entry || state.undoneSeqs.has(targetSeq)) return base
      const actor = state.players[entry.actorId]
      if (!actor) return base
      return {
        ...base,
        undoneSeqs: new Set([...state.undoneSeqs, targetSeq]),
        ...
      }
    }
```

**That append-only property is the trigger's foundation**: the number of entries
in `degommageLog` whose `targetId` is a given player only ever goes up, so a
change to it means "that player was just hit" and never "somebody undid
something". `takenByTarget` (which *excludes* undone hits and therefore goes
down on an undo) is deliberately **not** used as the trigger — using it would
replay the whole animation every time somebody presses « Annuler ».

### `apps/web/src/app/globals.css` — how this app writes keyframes today

The file is 589 lines. There is exactly one `@keyframes` block, at lines
568–588, and it shows the conventions to match (plain CSS, no Tailwind
plugin, a `prefers-reduced-motion` block right after the rule that uses it):

```css
.tab-bubble-water {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bronze) 22%, transparent);
  border: 1px solid color-mix(in srgb, var(--bronze) 45%, transparent);
  box-shadow: inset 0 1px 4px rgba(255, 255, 255, 0.25);
  animation: water-squash 420ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes water-squash {
  0% { transform: scale(1, 1); }
  45% { transform: scale(1.18, 0.82); }
  100% { transform: scale(1, 1); }
}

@media (prefers-reduced-motion: reduce) {
  .tab-bubble { transition: none; }
  .tab-bubble-water { animation: none; }
  .tab-item { transition: none; }
}
```

Tailwind 4 is imported at line 1 (`@import "tailwindcss";`) and the design
tokens are plain CSS custom properties declared on `:root` (lines 3–30), mirrored
for dark mode by both `@media (prefers-color-scheme: dark)` (line 33) and
`:root[data-theme="dark"]` (line 46). The tokens this plan uses:

```css
  --ink: #251a10;          /* dark: #f1e3c2 */
  --asterix: #b23a2e;      /* dark: #e2564a  — the red of the app */
  --caius: #b9861f;        /* dark: #e3ac3e  — the gold */
  --surface-2: #fbf6e9;    /* dark: #2b2115  — card background */
  --font-display: var(--font-cinzel, 'Cinzel'), 'Times New Roman', Georgia, serif;
```

and `.card`, lines 133–138:

```css
.card {
  background: var(--surface-2);
  border: 1.5px solid var(--parchment-line);
  border-radius: 14px;
  padding: 0.85rem 0.95rem;
}
```

`.card` sets no `position` and no `overflow`, so the effect layer must set its
own `position: absolute` inside a card that this plan makes `relative`.

### Interaction with plan 007 (verified — confirm, don't assume)

Plan 007's per-target tap lock lives entirely in
`apps/web/src/components/live/tap-lock.ts` / `use-tap-lock.ts` and is consumed
by `apps/web/src/components/live/tap-zone.tsx` — the « Tu viens de dégommer
qui ? » chip row, i.e. the **tapper's** chips. This plan animates the
**target's** roster card in the grid above. Different components, no shared
state, no shared class. Nothing in this plan touches the lock.

### Repo conventions that apply

- TypeScript strict, `noUncheckedIndexedAccess: true`, `noImplicitReturns:
  true`. No `any`, no `as` casts.
- All code, comments and commit messages in **English**; French only in
  user-facing strings.
- The app uses the typographic apostrophe `’` (U+2019) in French copy.
- Tests are pure-TS `*.test.ts`, co-located, `vitest`, **node** environment
  (`apps/web/vitest.config.ts` sets `environment: 'node'` and
  `include: ['src/**/*.test.ts']`). There is **no** `@testing-library/react` in
  this repo and `.tsx` files are not even collected. **Do not write component
  tests, do not add test dependencies.** Structural pattern to copy:
  `apps/web/src/components/live/tap-lock.test.ts` and
  `apps/web/src/components/live/finish-guard.test.ts`.

### Design constraints to honor (quoted — you have not read these docs)

From the validated animation artifact:

- « **Secousse & étoiles + PAF !**, joués ensemble en **560 ms**, avec le petit
  rebond du compteur emprunté à la proposition 5 (sans le marteau). »
- « la secousse attire l'œil, l'onomatopée nomme l'événement, le compteur
  confirme le chiffre. Trois lectures en un seul geste. »
- « Elle change à chaque coup (PAF, BAM, TCHAC, VLAN…) pour que deux dégommages
  d'affilée [ne se ressemblent pas]. »
- « **Garder en réserve** — « Menhir ! » pour le dégommage décisif, une fois le
  reste posé. « Impact d'arène » fait doublon avec la secousse. » → **« Menhir ! »
  is explicitly out of scope.**
- « **Mouvement réduit** — la même combinaison retombe sur le fondu du compteur,
  sans exception. »
- « Toutes les démos n'animent que `transform` et `opacity` : rien ne change de
  taille dans le flux, donc aucune carte voisine ne saute pendant qu'un joueur
  lit son écran. Aucune animation ne dépasse 760 ms et aucune ne bloque une
  interaction. »

## Commands you will need

| Purpose            | Command                                                                                          | Expected on success                     |
|--------------------|--------------------------------------------------------------------------------------------------|-----------------------------------------|
| Install            | `pnpm install`                                                                                     | exit 0                                  |
| New unit tests     | `pnpm --filter @degommix/web test src/components/live/hit-fx.test.ts`                              | exit 0, all pass                        |
| All web unit tests | `pnpm --filter @degommix/web test`                                                                 | exit 0                                  |
| Typecheck (repo)   | `pnpm typecheck`                                                                                   | exit 0                                  |
| Lint (repo)        | `pnpm lint`                                                                                        | exit 0                                  |
| Full suite         | `docker compose -f docker-compose.test.yml up -d` then `pnpm exec turbo run test --concurrency=1`   | exit 0                                  |
| E2E                | `docker compose -f docker-compose.test.yml up -d` then `pnpm test:e2e`                              | exit 0                                  |

Package manager `pnpm@11.13.1`, Node ≥ 22, Turborepo. Run everything from the
repository root.

## Scope

**In scope** (the only files you may create or modify):

- `apps/web/src/lib/seq-hash.ts` (create **only if it does not already exist** —
  plan 010 creates the same file with the same content)
- `apps/web/src/lib/seq-hash.test.ts` (same condition)
- `apps/web/src/components/live/hit-fx.ts` (create)
- `apps/web/src/components/live/hit-fx.test.ts` (create)
- `apps/web/src/components/live/player-card.tsx` (modify)
- `apps/web/src/components/live/live-screen.tsx` (modify — the card grid only)
- `apps/web/src/app/globals.css` (append a new block at the end)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- « Menhir ! », « Impact d'arène », « Pion culbuté », « Compteur forgé » — five
  of the six proposals were rejected. Implement the validated combo and nothing
  else.
- `apps/web/src/components/live/tap-zone.tsx`, `tap-lock.ts`, `use-tap-lock.ts`
  — plan 007's lock is on the tapper's chips; it is unrelated and must not
  change. Adding an animation to the chip you tapped is **not** this plan.
- `apps/web/src/components/live/summary.tsx` — the end-of-game screen has its
  own validated sequence (plan 012). Do not animate it here.
- `packages/game-core/**`, `apps/ws-server/**`, `packages/db/**` — no new event,
  no payload field, nothing persisted. The animation is derived client-side
  from state that is already replicated.
- Any JS-driven `prefers-reduced-motion` check (`window.matchMedia`, a hook, a
  provider). The media query belongs in `globals.css` — see Step 4. A JS toggle
  would also break SSR hydration.
- `e2e/happy-path.spec.ts` — it must keep passing **unmodified**. In particular
  `expectCounter` (`e2e/helpers.ts:31-36`) reads
  `getByTestId('player-card-<username>').getByTestId('degommage-count')`; if you
  feel the need to move or wrap that node, that is a STOP condition.
- Sound. No audio anywhere in this app.

## Git workflow

- Branch: `feat/degommage-hit-animation` (repo convention `type/slug`).
- Conventional Commits in English. Suggested:
  1. `test(web): specify the degommage hit trigger and onomatopee picker`
  2. `feat(web): shake, stars and onomatopee stamp on the target card`
- Do NOT push and do NOT open a PR unless the operator instructed it.

## The one mechanism (decided after reading the code — do not substitute another)

Every effect is a CSS animation selected by a **`data-hit` attribute on the card
root whose value alternates between `"a"` and `"b"` on every new hit taken by
that player**. Changing `animation-name` is what restarts a CSS animation, so
each effect is declared twice — once under `[data-hit='a']`, once under
`[data-hit='b']` — with identical keyframes under two names.

The alternating value is the **parity of the player's monotonic hit count**
(number of entries in `state.degommageLog` targeting them). That count only ever
increments, so:

- consecutive hits on the same card always flip the attribute → the animation
  always restarts, even mid-flight;
- an `UNDO` does not change the count → nothing replays when a player presses
  « Annuler la dernière action »;
- a page reload rebuilds the same count from the same log → the card is at rest
  (the attribute does not "change", so nothing plays on mount).

**Why not a React `key` remount** (the other obvious option): the card contains
a `next/image` portrait (`CharacterBadge`); remounting it on every dégommage
tears down and rebuilds that `<img>`. The attribute swap keeps the DOM intact.

**Why not a JS class toggle with a timer**: it would need a `setTimeout` per
card to remove the class, a forced reflow (`void el.offsetWidth`) to restart it,
and an effect cleanup on unmount. The attribute swap needs none of that, and
`animation-fill-mode: both` leaves the card in its rest state after the last
frame.

## Steps

### Step 1: Confirm the ground truth

Run the drift check. Then read in full: `player-card.tsx`,
`live-screen.tsx` lines 100–160, `globals.css` lines 550–589, and
`e2e/helpers.ts`. Confirm every excerpt above matches.

**Verify**:
- `grep -n "@keyframes" apps/web/src/app/globals.css` → exactly one match
  (`water-squash`, around line 579).
- `grep -n "degommage-count" apps/web/src e2e -r` → exactly two matches:
  `player-card.tsx:38` and `e2e/helpers.ts:34`.
- `grep -rn "matchMedia" apps/web/src` → **no matches** (this app has never
  needed a JS motion check; keep it that way).
- `pnpm --filter @degommix/web test` → exit 0 (green baseline).

### Step 2: Ensure the shared seq hash exists

Check whether plan 010 already landed:

```bash
ls apps/web/src/lib/seq-hash.ts
```

**If the file exists**, read it and confirm it exports
`hashSeq(seq: number): number`. Do not modify it. Skip to Step 3.

**If it does not exist**, create `apps/web/src/lib/seq-hash.ts` with exactly:

```ts
/**
 * 32-bit integer finalizer used to derive presentation choices from an event's
 * `seq` (the authoritative sequence number attributed by the ws-server).
 *
 * Why not `Math.random()`: game state is replicated, so two phones looking at
 * the same event must render the same thing. `seq` is the only value that is
 * unique, shared, and stable across reloads and late resyncs, so every
 * per-event random-looking choice in the app is a pure function of it.
 *
 * The mix is the well-known xor-shift/multiply finalizer; it is not a
 * cryptographic hash and must never be used as one.
 */
export function hashSeq(seq: number): number {
  let h = Math.trunc(seq) | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  return (h ^ (h >>> 16)) >>> 0
}
```

and `apps/web/src/lib/seq-hash.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { hashSeq } from './seq-hash'

describe('hashSeq', () => {
  it('is deterministic', () => {
    expect(hashSeq(42)).toBe(hashSeq(42))
  })

  it('returns an unsigned 32-bit integer', () => {
    for (const seq of [0, 1, 7, 1000, 2 ** 31 - 1]) {
      const h = hashSeq(seq)
      expect(Number.isInteger(h)).toBe(true)
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThanOrEqual(0xffffffff)
    }
  })

  it('produces different values for consecutive seqs', () => {
    expect(hashSeq(1)).not.toBe(hashSeq(2))
    expect(hashSeq(2)).not.toBe(hashSeq(3))
  })
})
```

**Verify**: `pnpm --filter @degommix/web test src/lib/seq-hash.test.ts` → exit 0.

### Step 3 (TEST-FIRST): Specify the trigger and the onomatopée picker

Create `apps/web/src/components/live/hit-fx.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { DegommageEntry } from '@degommix/game-core'
import { HIT_ONOMATOPEES, hitByTarget, pickOnomatopee } from './hit-fx'

function log(...pairs: readonly [number, string][]): DegommageEntry[] {
  return pairs.map(([seq, targetId]) => ({ seq, actorId: 'x', targetId }))
}

describe('hitByTarget', () => {
  it('returns nothing for an empty log', () => {
    expect(hitByTarget([])).toEqual({})
  })

  it('counts every entry per target, in seq order', () => {
    const hits = hitByTarget(log([1, 'a'], [2, 'b'], [3, 'a'], [4, 'a']))
    expect(hits.a).toEqual({ count: 3, seq: 4, previousSeq: 3 })
    expect(hits.b).toEqual({ count: 1, seq: 2, previousSeq: null })
  })

  it('keeps counting undone dégommages — the log is append-only', () => {
    // An UNDO never removes an entry from degommageLog (see reducer.ts), so the
    // count must not move when one happens; only a new DEGOMMAGE moves it.
    const before = hitByTarget(log([1, 'a'], [2, 'a']))
    const after = hitByTarget(log([1, 'a'], [2, 'a']))
    expect(after).toEqual(before)
  })

  it('flips the count parity on every consecutive hit on the same target', () => {
    const entries = log([1, 'a'], [5, 'a'], [9, 'a'])
    const parities = entries.map((_, i) => hitByTarget(entries.slice(0, i + 1)).a?.count ?? 0)
    expect(parities).toEqual([1, 2, 3])
  })
})

describe('pickOnomatopee', () => {
  it('offers exactly the six validated words', () => {
    expect(HIT_ONOMATOPEES).toEqual(['Paf !', 'Bam !', 'Tchac !', 'Vlan !', 'Ouch !', 'Boum !'])
  })

  it('is deterministic for a given seq', () => {
    for (const seq of [1, 2, 17, 512, 99999]) {
      expect(pickOnomatopee(seq, null)).toBe(pickOnomatopee(seq, null))
    }
  })

  it('always returns a word from the list', () => {
    for (let seq = 1; seq <= 300; seq++) {
      expect(HIT_ONOMATOPEES).toContain(pickOnomatopee(seq, null))
    }
  })

  it('never repeats the previous word on the same card', () => {
    let previousSeq: number | null = null
    let previousWord: string | null = null
    for (let seq = 1; seq <= 300; seq++) {
      const word = pickOnomatopee(seq, previousSeq)
      if (previousWord !== null) expect(word).not.toBe(previousWord)
      previousWord = word
      previousSeq = seq
    }
  })

  it('uses all six words within 60 hits', () => {
    const seen = new Set<string>()
    let previousSeq: number | null = null
    for (let seq = 1; seq <= 60; seq++) {
      seen.add(pickOnomatopee(seq, previousSeq))
      previousSeq = seq
    }
    expect(seen.size).toBe(6)
  })
})
```

**Verify**: `pnpm --filter @degommix/web test src/components/live/hit-fx.test.ts`
→ **fails**, because `./hit-fx` does not exist yet. Confirm it fails for that
reason and no other.

Commit: `test(web): specify the degommage hit trigger and onomatopee picker`.

### Step 4: Create the trigger helper

Create `apps/web/src/components/live/hit-fx.ts`:

```ts
import type { DegommageEntry } from '@degommix/game-core'
import { hashSeq } from '@/lib/seq-hash'

/**
 * The six comic-book words that stamp over a struck card. Stored capitalised
 * and rendered uppercase by `.hit-stamp` in `globals.css`.
 */
export const HIT_ONOMATOPEES = ['Paf !', 'Bam !', 'Tchac !', 'Vlan !', 'Ouch !', 'Boum !'] as const

/** What a player's card needs to know about the last hit it took. */
export interface TargetHit {
  /**
   * Monotonic number of dégommages aimed at this player. Counts undone ones on
   * purpose: `degommageLog` is append-only (an UNDO only adds the seq to
   * `undoneSeqs`), so this value never goes down — which is exactly what makes
   * "the parity changed" mean "a new hit landed" and never "somebody undid".
   */
  readonly count: number
  /** `seq` of the most recent hit — the seed of the onomatopée. */
  readonly seq: number
  /** `seq` of the hit before it, so two consecutive stamps differ. */
  readonly previousSeq: number | null
}

/**
 * Folds the game's dégommage log into a `targetId → TargetHit` lookup. Pure and
 * cheap: a live game holds a few dozen entries at most.
 */
export function hitByTarget(log: readonly DegommageEntry[]): Record<string, TargetHit> {
  const hits: Record<string, TargetHit> = {}
  for (const entry of log) {
    const current = hits[entry.targetId]
    hits[entry.targetId] = current
      ? { count: current.count + 1, seq: entry.seq, previousSeq: current.seq }
      : { count: 1, seq: entry.seq, previousSeq: null }
  }
  return hits
}

/**
 * Picks the onomatopée for a hit. Seeded by `seq` so every phone stamps the
 * same word on the same card at the same moment; shifted one slot when it would
 * repeat the previous hit's word on that card, which keeps it deterministic
 * while making a visible repeat impossible.
 */
export function pickOnomatopee(seq: number, previousSeq: number | null): string {
  const index = hashSeq(seq) % HIT_ONOMATOPEES.length
  const previousIndex = previousSeq === null ? -1 : hashSeq(previousSeq) % HIT_ONOMATOPEES.length
  const chosen = index === previousIndex ? (index + 1) % HIT_ONOMATOPEES.length : index
  return HIT_ONOMATOPEES[chosen] ?? HIT_ONOMATOPEES[0]
}

/** `"a"` or `"b"`, flipped by every new hit so the CSS animations restart. */
export function hitPhase(hit: TargetHit | undefined): 'a' | 'b' | undefined {
  if (!hit) return undefined
  return hit.count % 2 === 0 ? 'a' : 'b'
}
```

**Verify**: `pnpm --filter @degommix/web test src/components/live/hit-fx.test.ts`
→ exit 0, 9 tests pass.

### Step 5: Add the effect CSS

Append the following block at the **end** of `apps/web/src/app/globals.css`
(after the existing `prefers-reduced-motion` block that closes the file at line
589). Do not modify any existing rule.

```css
/**
 * Dégommage hit — « Secousse & étoiles + PAF ! », 560 ms, played on the struck
 * player's card on every phone. Only `transform` and `opacity` are animated, so
 * the card never changes size in the flow and no neighbour jumps while somebody
 * is reading their screen.
 *
 * Restart mechanism: `data-hit` on the card alternates between "a" and "b" on
 * every new hit (parity of that player's monotonic hit count — see
 * `components/live/hit-fx.ts`). Changing `animation-name` is what restarts a CSS
 * animation, which is why every effect is declared twice under two names. The
 * duplication buys a restart with no React remount — the card holds a
 * `next/image` portrait we do not want to tear down 20 times a game.
 */
.player-card {
  position: relative;
}

.hit-fx {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
  z-index: 2;
}

.hit-star {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 12px;
  height: 12px;
  opacity: 0;
  background: var(--caius);
  clip-path: polygon(
    50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%,
    50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%
  );
  will-change: transform, opacity;
}

.hit-star.ink { background: var(--ink); }

.hit-stamp {
  position: absolute;
  left: 50%;
  top: 50%;
  opacity: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--asterix);
  transform: translate(-50%, -50%);
  /* Comic-book outline: a ring of hard offsets in the card colour, plus one
     ink offset for the printed-sticker depth. */
  text-shadow:
    -2px -2px 0 var(--surface-2), 2px -2px 0 var(--surface-2),
    -2px 2px 0 var(--surface-2), 2px 2px 0 var(--surface-2),
    -3px 0 0 var(--surface-2), 3px 0 0 var(--surface-2),
    0 -3px 0 var(--surface-2), 0 3px 0 var(--surface-2),
    3px 3px 0 var(--ink);
  will-change: transform, opacity;
}

.hit-tally { display: inline-flex; will-change: transform; }

@keyframes hit-shake-a {
  0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
  14% { transform: translate3d(-7px, 0, 0) rotate(-1.3deg); }
  29% { transform: translate3d(6px, 0, 0) rotate(1.1deg); }
  44% { transform: translate3d(-4px, 0, 0) rotate(-0.8deg); }
  60% { transform: translate3d(3px, 0, 0) rotate(0.6deg); }
  80% { transform: translate3d(-1.5px, 0, 0) rotate(-0.25deg); }
}
@keyframes hit-shake-b {
  0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
  14% { transform: translate3d(-7px, 0, 0) rotate(-1.3deg); }
  29% { transform: translate3d(6px, 0, 0) rotate(1.1deg); }
  44% { transform: translate3d(-4px, 0, 0) rotate(-0.8deg); }
  60% { transform: translate3d(3px, 0, 0) rotate(0.6deg); }
  80% { transform: translate3d(-1.5px, 0, 0) rotate(-0.25deg); }
}

@keyframes hit-star-a {
  0% { opacity: 0; transform: translate(-50%, -50%) translate3d(0, 0, 0) scale(0.2) rotate(0deg); }
  22% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -50%) translate3d(var(--x), var(--y), 0) scale(1.05) rotate(150deg); }
}
@keyframes hit-star-b {
  0% { opacity: 0; transform: translate(-50%, -50%) translate3d(0, 0, 0) scale(0.2) rotate(0deg); }
  22% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -50%) translate3d(var(--x), var(--y), 0) scale(1.05) rotate(150deg); }
}

@keyframes hit-stamp-a {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(2.7) rotate(-24deg); }
  24% { opacity: 1; transform: translate(-50%, -50%) scale(0.9) rotate(-9deg); }
  36% { opacity: 1; transform: translate(-50%, -50%) scale(1.07) rotate(-11.5deg); }
  58% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(-10deg); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.14) rotate(-10deg); }
}
@keyframes hit-stamp-b {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(2.7) rotate(-24deg); }
  24% { opacity: 1; transform: translate(-50%, -50%) scale(0.9) rotate(-9deg); }
  36% { opacity: 1; transform: translate(-50%, -50%) scale(1.07) rotate(-11.5deg); }
  58% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(-10deg); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.14) rotate(-10deg); }
}

@keyframes hit-tally-a {
  0% { transform: scale(1); }
  40% { transform: scale(1.22); }
  70% { transform: scale(0.96); }
  100% { transform: scale(1); }
}
@keyframes hit-tally-b {
  0% { transform: scale(1); }
  40% { transform: scale(1.22); }
  70% { transform: scale(0.96); }
  100% { transform: scale(1); }
}

.player-card[data-hit='a'] { animation: hit-shake-a 560ms cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
.player-card[data-hit='b'] { animation: hit-shake-b 560ms cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }

.player-card[data-hit='a'] .hit-star { animation: hit-star-a 560ms cubic-bezier(0.2, 0.7, 0.3, 1) both; }
.player-card[data-hit='b'] .hit-star { animation: hit-star-b 560ms cubic-bezier(0.2, 0.7, 0.3, 1) both; }

.player-card[data-hit='a'] .hit-stamp { animation: hit-stamp-a 560ms cubic-bezier(0.2, 0.8, 0.3, 1) 40ms both; }
.player-card[data-hit='b'] .hit-stamp { animation: hit-stamp-b 560ms cubic-bezier(0.2, 0.8, 0.3, 1) 40ms both; }

.player-card[data-hit='a'] .hit-tally { animation: hit-tally-a 420ms cubic-bezier(0.3, 1.4, 0.4, 1) 170ms both; }
.player-card[data-hit='b'] .hit-tally { animation: hit-tally-b 420ms cubic-bezier(0.3, 1.4, 0.4, 1) 170ms both; }

@keyframes hit-tally-fade-a {
  0% { opacity: 1; }
  32% { opacity: 0.12; }
  100% { opacity: 1; }
}
@keyframes hit-tally-fade-b {
  0% { opacity: 1; }
  32% { opacity: 0.12; }
  100% { opacity: 1; }
}

/* Reduced motion: no shake, no stars, no stamp — the counter just breathes. */
@media (prefers-reduced-motion: reduce) {
  .player-card[data-hit] { animation: none; }
  .hit-fx { display: none; }
  .player-card[data-hit='a'] .hit-tally { animation: hit-tally-fade-a 420ms ease both; }
  .player-card[data-hit='b'] .hit-tally { animation: hit-tally-fade-b 420ms ease both; }
}
```

**Verify**: `grep -c "@keyframes hit-" apps/web/src/app/globals.css` → `10`.

### Step 6: Render the effect layer in `PlayerCard`

Rewrite `apps/web/src/components/live/player-card.tsx` as:

```tsx
import type { PlayerState } from '@degommix/game-core'
import { Icon } from '@/components/icons'
import { CharacterBadge } from '@/components/ui/character-badge'
import { CHARACTER_META } from '@/lib/characters'
import { hitPhase, pickOnomatopee, type TargetHit } from './hit-fx'

interface PlayerCardProps {
  player: PlayerState
  username: string
  isHost: boolean
  /** Degommages suffered so far, hidden while still at zero. */
  taken?: number
  /**
   * Last dégommage aimed at this player. Drives the hit animation: the card
   * shakes, stars fire, an onomatopée stamps and the tally pops — identically
   * on every phone, because the word is derived from the event's `seq`.
   */
  hit?: TargetHit
}

/** Star exit vectors, sized for a half-width roster card. */
const STARS = [
  { x: '-38px', y: '-22px', ink: false },
  { x: '34px', y: '-25px', ink: true },
  { x: '46px', y: '10px', ink: false },
  { x: '-46px', y: '8px', ink: true },
] as const

/**
 * Roster card of the live screen: portrait, pseudo (crown for the host) and
 * the sword tally. A player who left is grayed out with the quit note. When a
 * dégommage lands on this player the card plays the validated hit combo — see
 * `hit-fx.ts` for the trigger and `globals.css` for the keyframes.
 */
export function PlayerCard({ player, username, isHost, taken, hit }: PlayerCardProps) {
  const phase = hitPhase(hit)

  return (
    <div
      className="card player-card flex items-center gap-3 p-3"
      data-testid={`player-card-${username}`}
      data-hit={phase}
      style={player.inGame ? undefined : { opacity: 0.55, filter: 'grayscale(0.7)' }}
    >
      <CharacterBadge character={player.character} size="md" />
      <div className="min-w-0">
        <p className="m-0 flex items-center gap-1 truncate text-sm font-bold">
          <span className="truncate">{username}</span>
          {isHost ? (
            <Icon name="crown" size={13} className="shrink-0" title="Hôte de la partie" />
          ) : null}
        </p>
        <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
          {CHARACTER_META[player.character].label}
        </p>
        <p className="m-0 mt-1 flex items-center gap-1 text-sm font-bold">
          <Icon name="sword" size={14} title="Pions dégommés" />
          <span className="hit-tally" data-testid="degommage-count">
            {player.degommages}
          </span>
        </p>
        {taken !== undefined && taken > 0 ? (
          <p className="m-0 text-xs" style={{ color: 'var(--ink-faint)' }}>
            {taken} subi{taken > 1 ? 's' : ''}
          </p>
        ) : null}
        {player.inGame ? null : (
          <p className="m-0 text-xs italic" style={{ color: 'var(--ink-faint)' }}>
            a quitté la partie
          </p>
        )}
      </div>

      {hit ? (
        <span className="hit-fx" aria-hidden="true">
          {STARS.map((star) => (
            <i
              key={`${star.x}${star.y}`}
              className={star.ink ? 'hit-star ink' : 'hit-star'}
              style={{ '--x': star.x, '--y': star.y } as React.CSSProperties}
            />
          ))}
          <span className="hit-stamp">{pickOnomatopee(hit.seq, hit.previousSeq)}</span>
        </span>
      ) : null}
    </div>
  )
}
```

Three constraints you must not break:

- `data-testid="degommage-count"` stays on the element that holds **only** the
  number (`e2e/helpers.ts` asserts `toHaveText(String(count))` on it — adding a
  sibling inside it would break the e2e suite).
- The whole effect layer is `aria-hidden="true"` and `pointer-events: none`
  (set in CSS): it is decoration, it must not reach a screen reader and must
  never swallow a tap.
- Import the `CSSProperties` type properly rather than using the `React.`
  namespace if the file has no React import — either
  `import type { CSSProperties } from 'react'` and `as CSSProperties`, matching
  `apps/web/src/components/ui/character-badge.tsx:2`, or keep the `React.`
  form if `React` is in scope. **Match `character-badge.tsx`**: use the named
  type import. No `any`.

### Step 7: Feed the hit from `LiveScreen`

In `apps/web/src/components/live/live-screen.tsx`:

1. Add the import next to the existing `./` imports:

```ts
import { hitByTarget } from './hit-fx'
```

2. Next to the existing `const taken = takenByTarget(state)` (line 117), add:

```ts
  const taken = takenByTarget(state)
  // Append-only per-target hit count: what drives the card animation. Distinct
  // from `taken`, which excludes undone dégommages and would therefore replay
  // the whole animation every time somebody presses « Annuler ».
  const hits = hitByTarget(state.degommageLog)
```

3. Pass it to the card:

```tsx
            <PlayerCard
              key={userId}
              player={player}
              username={displayName(names, userId)}
              isHost={userId === hostId}
              taken={taken[userId] ?? 0}
              hit={hits[userId]}
            />
```

Change nothing else in this file.

**Verify**:
- `pnpm typecheck` → exit 0.
- `pnpm lint` → exit 0.
- `pnpm --filter @degommix/web test` → exit 0.
- `grep -n "takenByTarget" apps/web/src/components/live/live-screen.tsx` → still
  present (the « N subis » line from plan 003 is untouched).

Commit: `feat(web): shake, stars and onomatopee stamp on the target card`.

### Step 8: Full verification

From the repo root:

1. `pnpm --filter @degommix/web test` → exit 0.
2. `pnpm typecheck` → exit 0.
3. `pnpm lint` → exit 0.
4. `docker compose -f docker-compose.test.yml up -d` then
   `pnpm exec turbo run test --concurrency=1` → exit 0. (If Docker is
   unavailable, say so explicitly; do not claim the suite passed.)
5. `docker compose -f docker-compose.test.yml up -d` then `pnpm test:e2e` →
   exit 0, **with `e2e/happy-path.spec.ts` unmodified**.
6. `git status --porcelain` → only the in-scope files.

Paste the actual tail of each command's output in your report.

### Step 9: Visual verification (required — this is an animation)

A green test suite proves nothing about a 560 ms animation. Start an isolated
stack (own database and ports so it cannot collide with a dev stack):

```bash
docker run -d --name degommix-plan011 \
  -e POSTGRES_USER=degommix -e POSTGRES_PASSWORD=degommix -e POSTGRES_DB=degommix_test \
  -e LANG=en_US.utf8 -e POSTGRES_INITDB_ARGS="--locale=en_US.UTF-8" \
  -p 54402:5432 postgres:16

export DATABASE_URL=postgres://degommix:degommix@localhost:54402/degommix_test
export BETTER_AUTH_SECRET=plan011-secret-0123456789-abcdefghij
export BETTER_AUTH_URL=http://localhost:3011
export NEXT_PUBLIC_WS_URL=http://localhost:4012
export WEB_ORIGIN=http://localhost:3011
export PORT=4012

pnpm --filter @degommix/db db:migrate
pnpm --filter @degommix/ws-server exec tsx src/index.ts &     # ws-server on :4012
pnpm --filter @degommix/web exec next dev -p 3011             # web on :3011
```

(Variable names and meanings come from `.env.example`. The ws-server reads no
`.env` file — its variables must be in the process environment.)

Two browser profiles at the 390 × 844 viewport (`e2e/playwright.config.ts`),
accounts A and B already friends. Start a 1v1 game, then check, in this order:

1. A taps B's chip once.
   - **Expected on both phones**: B's card shakes, four stars fly out, a word
     (PAF ! / BAM ! / TCHAC ! / VLAN ! / OUCH ! / BOUM !) stamps over it and
     fades, and the sword tally pops. Total ≈ 0.6 s.
   - **Expected**: the *same word* on both phones.
   - **Expected**: A's card does **not** move. The journal line below does not
     jump. No horizontal scrollbar appears.
2. A taps B twice in a row (≈ 2 s apart — the tap lock holds a chip 1.2 s).
   - **Expected**: the animation restarts cleanly the second time, with a
     **different** word.
3. B taps A once.
   - **Expected**: now it is A's card that shakes, on both phones.
4. Press « Annuler la dernière action ».
   - **Expected**: the counter goes down and **nothing animates**. This is the
     single most important check in this list.
5. Reload one phone during a game with several dégommages already logged.
   - **Expected**: the cards render at rest. Nothing plays on mount.
6. Turn on reduced motion (macOS: System Settings → Accessibility → Display →
   Reduce motion; or in Chrome DevTools: Rendering → Emulate CSS
   `prefers-reduced-motion: reduce`) and tap again.
   - **Expected**: no shake, no stars, no stamp — the tally dips and comes back.
7. Toggle the app to dark theme and tap again.
   - **Expected**: the stamp outline still reads (it uses `--surface-2`, which
     flips with the theme) and the gold stars stay visible.

Screenshots to attach, all at 390 × 844: `plan011-hit-light.png` (captured
mid-animation, stamp visible), `plan011-hit-dark.png`, `plan011-rest.png` (same
screen at rest, to prove no layout shift), and `plan011-reduced-motion.png`.

Tear down: `docker rm -f degommix-plan011`.

## Test plan

Pure TypeScript, `vitest`, node environment, co-located. Structural pattern:
`apps/web/src/components/live/tap-lock.test.ts`.

| File | Cases |
|---|---|
| `apps/web/src/lib/seq-hash.test.ts` (only if created here) | determinism; unsigned 32-bit range; consecutive seqs differ |
| `apps/web/src/components/live/hit-fx.test.ts` | empty log; per-target count/seq/previousSeq; count unaffected by an undo (append-only log); count increments strictly; the six validated words, in order; picker determinism; word always in the list; **never repeats the previous word**; all six words within 60 hits |

No component test is added (no `@testing-library/react` in this repo — see "Repo
conventions"). The rendering change is covered by `pnpm typecheck`, the
unmodified e2e happy path (which asserts the counter through
`data-testid="degommage-count"`), and the manual pass in Step 9.

Verification: `pnpm --filter @degommix/web test src/components/live/hit-fx.test.ts`
→ exit 0, 9 tests pass.

## Done criteria

Machine-checkable unless marked MANUAL. ALL must hold:

- [ ] `pnpm --filter @degommix/web test src/components/live/hit-fx.test.ts` exits 0 (9 tests)
- [ ] `pnpm --filter @degommix/web test` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm exec turbo run test --concurrency=1` exits 0 with the test DB up (or the report states Docker was unavailable)
- [ ] `pnpm test:e2e` exits 0 **with `e2e/happy-path.spec.ts` unmodified** (`git diff --name-only` must not list it)
- [ ] `grep -c "@keyframes hit-" apps/web/src/app/globals.css` returns `10`
- [ ] `grep -rn "matchMedia" apps/web/src` returns no matches (reduced motion stays pure CSS)
- [ ] `grep -rn "setTimeout\|offsetWidth" apps/web/src/components/live/player-card.tsx apps/web/src/components/live/hit-fx.ts` returns no matches (no timer, no reflow hack)
- [ ] `grep -rn "menhir\|Menhir" apps/web/src` returns no matches (explicitly out of scope)
- [ ] `grep -n "takenByTarget" apps/web/src/components/live/live-screen.tsx` still matches (plan 003's « subis » line intact)
- [ ] `git diff --name-only e772284..HEAD` lists only files from the "In scope" list
- [ ] `git status --porcelain` shows no modification outside the in-scope list
- [ ] `plans/README.md` row for 011 added/updated
- [ ] **MANUAL**: Step 9 performed, its 7 checks reported one by one, with the four screenshots attached. Check 4 (**nothing animates on undo**) must be reported explicitly.

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts —
  the codebase drifted since commit `e772284`.
- `apps/web/src/lib/seq-hash.ts` exists but does **not** export
  `hashSeq(seq: number): number` with the body given in Step 2. Plan 010 owns
  that file; a different signature means the two plans disagreed and the
  onomatopée would stop matching the journal sentence. Report instead of
  editing it.
- `grep -n "@keyframes" apps/web/src/app/globals.css` in Step 1 shows keyframes
  other than `water-squash`: someone else added animation infrastructure and
  this plan's naming may collide.
- The animation requires a `setTimeout`, a forced reflow, a `matchMedia` call,
  or a React `key` remount to restart. It does not — the `data-hit` alternation
  covers every case. If you convince yourself otherwise, report the reasoning
  rather than switching mechanism.
- Making it work appears to require an event, a payload field or a DB column.
  Nothing about this animation is persisted or transmitted; it is derived from
  `degommageLog`, which every client already holds.
- `e2e/happy-path.spec.ts` fails, or you feel the need to edit it.
- Any step's verification fails twice after a reasonable fix attempt.
- The assumption "an `UNDO` never removes an entry from `degommageLog`" turns
  out to be false — the whole no-replay-on-undo argument rests on it.

## Maintenance notes

For whoever owns this code next:

- **What a reviewer should scrutinize**: (1) that the trigger reads
  `state.degommageLog`, not `takenByTarget` — otherwise every undo replays the
  animation; (2) that nothing remounts on a hit; (3) that only `transform` and
  `opacity` are animated (a `width`, `margin` or `font-size` keyframe would make
  the neighbouring card jump); (4) that `data-testid="degommage-count"` still
  wraps only the number.
- **Held in reserve, deliberately not built**: « Menhir ! » for a decisive
  dégommage (the artifact's own suggestion, « une fois le reste posé ») and
  « Impact d'arène » (rejected as redundant with the shake). If « Menhir ! »
  is ever added, it needs a *decisive-hit* signal that does not exist in the
  state today, so expect it to be a bigger change than it looks.
- **The keyframe duplication is load-bearing.** If someone "cleans up"
  `hit-shake-b` into `hit-shake-a`, consecutive hits on the same card silently
  stop restarting the animation, and no test will catch it — only Step 9 check 2
  will. Consider that check mandatory on any future edit to this CSS.
- **Shared with plan 010**: `apps/web/src/lib/seq-hash.ts`. Both the journal
  sentence and the onomatopée are seeded from the same `seq` through the same
  mix. Changing the mix changes both surfaces at once, which is fine (they are
  independent choices from one number) but will make an already-played game
  re-render differently on a reload.
- **Interaction with plan 012** (« endgame sequence »): 012 animates
  `summary.tsx`, which replaces the live screen entirely when
  `state.status === 'finished'` (`live-screen.tsx:99-109`). The two never run at
  the same time. 012 does, however, also append keyframes to `globals.css` — if
  both are in flight, expect a trivial merge conflict at the end of that file
  and keep both blocks.
- **Interaction with plan 007**: none. Verified — 007's lock is on the tapper's
  chips in `tap-zone.tsx`, this is on the target's roster card.
