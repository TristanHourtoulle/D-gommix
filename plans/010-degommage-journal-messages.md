# Plan 010: Give the live journal 44 varied dégommage sentences, deterministic on every phone

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
> `git diff --stat e772284..HEAD -- apps/web/src/components/live/use-live-journal.ts apps/web/src/components/live/live-journal.tsx apps/web/src/components/live/types.ts apps/web/src/lib/queries/stats.ts e2e/happy-path.spec.ts packages/game-core/src/types.ts`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `e772284`, 2026-07-25

## Why this matters

Dégommix is a companion app read aloud at a table. Today every dégommage in the
live journal produces the exact same sentence — « Astrid a dégommé un pion de
Marc » — and a normal game logs fifteen to twenty of them. By the third game the
line is wallpaper: nobody reads it, and the journal stops being the running
commentary it was designed to be. The owner validated a catalog of **44 French
sentences across four tones** (weighted 60 % « Baffes historiques », 15 % « Par
Toutatis », 10 % « Rome antique », 15 % « Chambrage de table ») to replace that
single line **in the live journal only**.

Two hard constraints make this a real engineering problem rather than a copy
change:

1. **Every phone must render the same sentence, forever.** State is replicated
   from an append-only event log; two players comparing screens (or one player
   reloading) must see identical text. So the choice is derived from the
   event's `seq`, never from `Math.random()`, and nothing is stored in the DB.
2. **The existing élision bug must be fixed at the same time.** The current
   sentence already produces « un pion de Astrid » where French wants « un pion
   d'Astrid », and 30 of the 44 new templates contain the same `de {nom}`
   construction. A single pure helper fixes the new templates *and* the
   surviving neutral/undo sentences.

When this lands, the journal reads differently on every hit, the detail page and
history stay factual, and « de Astrid » disappears from the product.

## Current state

### Files involved and their role

- `apps/web/src/components/live/use-live-journal.ts` — the live journal hook.
  Builds the two most recent French labels from the raw `game:event` broadcasts
  (plus the full history replayed on `game:state_snapshot`). **This is the only
  place the funny sentences may appear.**
- `apps/web/src/components/live/live-journal.tsx` — renders those labels. Not
  modified by this plan; quoted so you know the rendering surface.
- `apps/web/src/components/live/types.ts` — `NameMap` and `displayName`.
- `apps/web/src/lib/queries/stats.ts` — server-side journal of the **game detail
  page** (`/parties/[gameId]`). Stays factual; only its undo sentence gets the
  élision fix.
- `packages/game-core/src/types.ts` — event and state shapes (`seq`,
  `DEGOMMAGE`, `degommageLog`). **Read-only.**
- `e2e/happy-path.spec.ts` — the Playwright happy path. One of its assertions
  **will** break because of the élision fix; the exact fix is in Step 6.

### `apps/web/src/components/live/use-live-journal.ts` — lines 1–13 (verbatim)

```ts
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameEvent, GameState } from '@degommix/game-core'
import { useSocket } from '@/components/socket-provider'
import type { GameStateSnapshotPayload } from '@/lib/realtime-types'
import { displayName, type NameMap } from './types'

export interface JournalEntry {
  seq: number
  actorId: string | null
  label: string
}
```

Lines 29–39 — the sentence to replace (line 32) and the undo sentence to keep
(lines 33–39):

```ts
function describeEvent(event: GameEvent, events: GameEvent[], names: NameMap): string | null {
  switch (event.type) {
    case 'DEGOMMAGE':
      return `${displayName(names, event.actorId)} a dégommé un pion de ${displayName(names, event.targetId)}`
    case 'UNDO': {
      const undone = events.find((e) => e.seq === event.payload.targetSeq && e.type === 'DEGOMMAGE')
      if (!undone || undone.type !== 'DEGOMMAGE') {
        return `${displayName(names, event.actorId)} a annulé la dernière action`
      }
      return `${displayName(names, event.actorId)} a annulé le dégommage de ${displayName(names, undone.actorId)} sur ${displayName(names, undone.targetId)}`
    }
```

Lines 100–123 — the memo that builds the entries, including the **fallback
path** (lines 108–117) used when no raw event is available:

```ts
  return useMemo(() => {
    void version
    const events = [...eventsRef.current.values()].sort((a, b) => a.seq - b.seq)
    const entries: JournalEntry[] = []
    for (const event of events) {
      const label = describeEvent(event, events, names)
      if (label) entries.push({ seq: event.seq, actorId: event.actorId, label })
    }
    if (entries.length === 0 && state) {
      for (const entry of state.degommageLog) {
        if (state.undoneSeqs.has(entry.seq)) continue
        entries.push({
          seq: entry.seq,
          actorId: entry.actorId,
          label: `${displayName(names, entry.actorId)} a dégommé un pion de ${displayName(names, entry.targetId)}`,
        })
      }
    }
    const last = events[events.length - 1]
    return {
      entries: entries.slice(-JOURNAL_LENGTH).reverse(),
      lastEventAt: last?.createdAt ?? null,
    }
  }, [version, state, names])
```

**Important**: the events map is keyed by `seq` and sorted by `seq` before the
loop, so the ordered list of `DEGOMMAGE` events is already available and stable.
That ordering is what makes the picker deterministic.

### `apps/web/src/components/live/types.ts` (whole file, 12 lines)

```ts
/** Seat member passed from the server page (usernames come from the DB). */
export interface LivePlayer {
  userId: string
  username: string
}

/** userId → username lookup shared by the live components. */
export type NameMap = Record<string, string>

export function displayName(names: NameMap, userId: string): string {
  return names[userId] ?? 'Joueur'
}
```

### `apps/web/src/components/live/live-journal.tsx` — lines 11–31 (the render surface, unchanged by this plan)

```tsx
/** Folded journal: the two latest actions only, not expandable (design §5.2). */
export function LiveJournal({ entries, state }: LiveJournalProps) {
  return (
    <section className="card relative z-10 flex flex-col gap-2 p-3">
      <p className="sec-label">Journal de la partie</p>
      {entries.length === 0 ? (
        <p className="m-0 text-xs" style={{ color: 'var(--ink-soft)' }}>
          Aucune action pour l’instant.
        </p>
      ) : (
        entries.map((entry) => {
          const character = entry.actorId ? state.players[entry.actorId]?.character : undefined
          return (
            <div key={entry.seq} className="flex items-center gap-2 text-xs font-medium">
              {character ? <CharacterBadge character={character} size="sm" /> : null}
              <span>{entry.label}</span>
            </div>
          )
        })
      )}
    </section>
  )
}
```

Only **two** lines are shown at a time (`JOURNAL_LENGTH = 2` in
`use-live-journal.ts:22`) and the row also carries a `CharacterBadge`, which is
why the ≤ 60-character budget below is a hard requirement.

### `apps/web/src/lib/queries/stats.ts` — lines 245–256 (the factual journal that **stays factual**)

```ts
function journalText(event: RawEvent, events: RawEvent[], name: (id: string | null) => string): string {
  switch (event.type) {
    case 'GAME_STARTED':
      return `${name(event.actorId)} a lancé la partie`
    case 'DEGOMMAGE':
      return `${name(event.actorId)} a dégommé ${name(event.targetId)}`
    case 'UNDO': {
      const targetSeq = payloadNumber(event.payload, 'targetSeq')
      const target = events.find((candidate) => candidate.seq === targetSeq)
      if (!target) return `${name(event.actorId)} a annulé un dégommage`
      return `${name(event.actorId)} a annulé le dégommage de ${name(target.actorId)} sur ${name(target.targetId)}`
    }
```

Line 250 has **no `de`** before the name, so it needs no élision. Line 255 does
(`le dégommage de X`) — that one gets the helper.

### `packages/game-core/src/types.ts` — the shapes you rely on

```ts
interface BaseEvent {
  seq: number
  createdAt: string // ISO 8601, informative only (order = seq)
}

export type GameEvent =
  | ...
  | (BaseEvent & { type: 'DEGOMMAGE'; actorId: string; targetId: string; payload: null })
  | (BaseEvent & { type: 'UNDO'; actorId: string; targetId: null; payload: { targetSeq: number } })
```

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

`seq` is attributed by the ws-server (authoritative, monotonic, identical on
every client) — see `README.md`: « le ws-server valide chaque commande, attribue
le `seq` faisant foi, persiste puis broadcast à la room ». That is why `seq` is
the only acceptable seed. An `UNDO` never removes an entry from `degommageLog`;
it only adds the seq to `undoneSeqs` (`packages/game-core/src/reducer.ts:55-69`),
so the ordered list of dégommage seqs is append-only and stable.

### `e2e/happy-path.spec.ts` — the two journal assertions (READ THIS CAREFULLY)

Lines 100–103, on the **live** screen (undo, regex, no `de <name>` in the
matched substring) — **must keep passing unmodified**:

```ts
    // — Step 6: J2 undoes the last degommage —
    await p2.getByRole('button', { name: 'Annuler la dernière action' }).click()
    await expect(p1.getByText(new RegExp(`${J2.username} a annulé`))).toBeVisible()
    await expect(p2.getByText(new RegExp(`${J2.username} a annulé`))).toBeVisible()
```

Lines 136–143, on the **game detail page** `/parties/<id>` (the factual
`stats.ts` journal):

```ts
    // — Step 8c: game detail shows the full journal —
    await p1.goto(`/parties/${gameId}`)
    await expect(
      p1.getByText(`${J1.username} a dégommé ${J2.username}`, { exact: true })
    ).toHaveCount(2)
    await expect(
      p1.getByText(`${J2.username} a annulé le dégommage de ${J1.username} sur ${J2.username}`)
    ).toBeVisible()
```

With `J1.username = 'Asterix'` and `J2.username = 'Obelix'` (lines 5–6):

- The `a dégommé Obelix` assertion is **unaffected** — no `de` before the name.
- The undo assertion currently expects `… le dégommage de Asterix sur Obelix`.
  After the élision fix it becomes `… le dégommage d’Asterix sur Obelix`
  (`Asterix` starts with a vowel). **This assertion must be updated** — the
  exact replacement is prescribed in Step 6.
- **There is no assertion anywhere in `e2e/` on the live dégommage sentence
  itself** (verified: `grep -rn "a dégommé" e2e/` returns only
  `happy-path.spec.ts:142`, which is the detail-page line above). So varying the
  live text breaks nothing.

### Repo conventions that apply

- TypeScript strict, `noUncheckedIndexedAccess: true` and `noImplicitReturns:
  true` (`tsconfig.base.json`, `apps/web/tsconfig.json`). Indexing an array
  yields `T | undefined` — you must handle it, not cast it away. No `any`.
- All code, comments, identifiers and commit messages in **English**. French
  only inside user-facing string literals.
- The app uses the **typographic apostrophe `’` (U+2019)**, not `'`, in every
  French string — see `use-live-journal.ts:49` (`d’arrêter`),
  `stats.ts:264` (`d’inactivité`), `live-journal.tsx:17` (`l’instant`). The
  élision helper and all 44 templates below use `’`. Do not normalise them to
  ASCII apostrophes.
- Tests are co-located `*.test.ts` files run by `vitest` in a **node**
  environment. `apps/web/vitest.config.ts`:

  ```ts
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  ```

  There is **no** `@testing-library/react` anywhere in this repo (verified) and
  `include` does not even pick up `.tsx`. **Do not write component tests and do
  not add test dependencies.** Every test in this plan is pure TypeScript.
  Structural pattern to copy: `apps/web/src/lib/api-payloads.test.ts` and
  `apps/web/src/components/live/tap-lock.test.ts` (`describe` / `it` /
  `expect`, small object literals, no mocks).

### Design constraints to honor (quoted — you have not read these docs)

From the validated design artifact, decisions the owner approved and you must
not re-litigate:

- « Le journal live n'affiche que **2 lignes**. Au-delà de **60 caractères
  rendus**, la phrase se coupe ou pousse la ligne précédente hors de l'écran. »
  → every rendered template must stay ≤ 60 characters with two 10-character
  names. This is enforced by a test over the whole catalog (Step 4).
- « Aucun accord genré sur {acteur} ou {cible} » — the templates are already
  written that way; do not "improve" any of them into a gendered form.
- « Aucun vocabulaire issu des albums : pas de noms de personnages, pas de
  potion. » Toutatis, Bélénos, Épona, the carnyx and the falling sky are
  attested history, free of rights. **Do not add new sentences** and do not
  swap words for album references.
- « Les phrases drôles ne vivent que dans le journal live […] Le détail de
  partie et l'historique repassent à la formulation factuelle. »
- « L'annulation reste générique […] l'humour y ajouterait une couche
  d'interprétation au pire moment. »
- « Le poids est une donnée, pas du code : une valeur par ligne dans le
  catalogue. » → weights live in the catalog array, never in the picker.
- « index = hash(seq) % totalPoids → texte = catalogue[index] // même seq → même
  texte, sur tous les téléphones, à jamais. »
- « Elles sont marquées `sans {acteur}` […] et devraient rester minoritaires :
  un poids plus faible suffit. »

## Commands you will need

| Purpose               | Command                                                                                          | Expected on success                     |
|-----------------------|--------------------------------------------------------------------------------------------------|-----------------------------------------|
| Install               | `pnpm install`                                                                                     | exit 0                                  |
| New unit tests        | `pnpm --filter @degommix/web test src/lib/degommage-messages.test.ts`                              | exit 0, all pass                        |
| All web unit tests    | `pnpm --filter @degommix/web test`                                                                 | exit 0                                  |
| Typecheck (repo)      | `pnpm typecheck`                                                                                   | exit 0, no errors                       |
| Lint (repo)           | `pnpm lint`                                                                                        | exit 0                                  |
| Full suite            | `docker compose -f docker-compose.test.yml up -d` then `pnpm exec turbo run test --concurrency=1`   | exit 0 (integration suites need the DB) |
| E2E                   | `docker compose -f docker-compose.test.yml up -d` then `pnpm test:e2e`                              | exit 0                                  |

Package manager `pnpm@11.13.1`, Node ≥ 22, Turborepo. Run everything from the
repository root.

## Suggested executor toolkit

- Invoke `superpowers:test-driven-development` before Step 3: the catalog tests
  are the specification and must be written first.
- Invoke `superpowers:verification-before-completion` before reporting done —
  paste real command output, never assertions.

## Scope

**In scope** (the only files you may create or modify):

- `apps/web/src/lib/seq-hash.ts` (create)
- `apps/web/src/lib/seq-hash.test.ts` (create)
- `apps/web/src/lib/elision.ts` (create)
- `apps/web/src/lib/elision.test.ts` (create)
- `apps/web/src/lib/degommage-messages.ts` (create)
- `apps/web/src/lib/degommage-messages.test.ts` (create)
- `apps/web/src/components/live/use-live-journal.ts` (modify)
- `apps/web/src/lib/queries/stats.ts` (modify — **one line only**, the undo
  sentence)
- `e2e/happy-path.spec.ts` (modify — **one assertion only**, see Step 6)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/components/live/live-journal.tsx` — the rendering surface is
  correct as-is. Do not add truncation, tooltips, `title` attributes or a
  third journal line; the two-line fold is a design decision
  (`use-live-journal.ts:22`, design §5.2). If a sentence looks too long, the
  fix is the length test in Step 4, not the layout.
- `stats.ts:250` (`a dégommé ${name(event.targetId)}`) and everything else in
  `journalText` except the single undo line — the detail page and history stay
  factual by design.
- `packages/game-core/**`, `apps/ws-server/**`, `packages/db/**` — no event, no
  payload and no column changes. **Nothing about the chosen text is ever
  persisted or transmitted**; it is recomputed identically from `seq` on every
  device. If you find yourself wanting to store a message id, stop (see STOP
  conditions).
- The `UNDO`, `PLAYER_QUIT`, `END_REQUESTED`, `END_REJECTED` wording in either
  journal — apart from the élision fix, every character stays identical.
- The catalog contents: 44 sentences, no more, no fewer, byte-identical to the
  arrays in Step 3. Do not reword, do not add, do not "fix" the punctuation.

## Git workflow

- Branch: `feat/degommage-journal-messages` (repo convention is `type/slug`;
  see `git log` and branches like `fix/per-target-tap-lock`).
- Conventional Commits in English. Example from `git log`:
  `feat(web): invalidate home and leaderboard caches when a game finishes`.
  Suggested messages here:
  1. `test(web): specify the degommage message catalog and elision helper`
  2. `feat(web): deterministic degommage sentences in the live journal`
  3. `fix(web): elide « de » before vowel-initial names in both journals`
- Do NOT push and do NOT open a PR unless the operator instructed it.

## The catalog arithmetic (read before Step 3 — you must be able to defend it)

The owner approved a **tone mix of 60 / 15 / 10 / 15**. Weights are per-message
integers; the mix is the *sum of a tone's weights over the grand total*.

Within a tone, the rule is: a message that names both players carries the tone's
**full weight `F`**, and a « sans {acteur} » message (one that never names the
actor — punchier, but it leans on the bronze character badge to identify who
struck) carries **`floor(F / 2)`**.

| Tone                  | Messages | of which « sans acteur » | Full weight `F` | Sans weight | Tone total          | Share of 484 | Target |
|-----------------------|----------|--------------------------|-----------------|-------------|---------------------|--------------|--------|
| Baffes historiques    | 11       | 0                        | 26              | —           | `11×26 = 286`       | **59.09 %**  | 60 %   |
| Par Toutatis          | 11       | 5                        | 9               | 4           | `6×9 + 5×4 = 74`    | **15.29 %**  | 15 %   |
| Rome antique          | 11       | 1                        | 5               | 2           | `10×5 + 1×2 = 52`   | **10.74 %**  | 10 %   |
| Chambrage de table    | 11       | 4                        | 8               | 4           | `7×8 + 4×4 = 72`    | **14.88 %**  | 15 %   |
| **Total**             | **44**   | **10**                   | —               | —           | **`TOTAL_WEIGHT = 484`** | **100 %** | 100 %  |

Largest deviation from the target: 0.91 points (Baffes). Chambrage lands
*below* its 15 % target on purpose — the artifact calls it « plafonné exprès,
parce que c'est le ton qui vieillit le plus vite ».

These numbers are asserted by tests in Step 4, so a future retune cannot drift
silently: change a weight, and the tone-share test tells you the new mix.

Simulated over `seq = 1..5000` with the no-repeat shift applied, the *observed*
mix is **59.6 / 15.0 / 9.9 / 15.5 %** and **zero** consecutive repeats. Over the
first 40 seqs (a long game) all four tones appear. These figures are what the
distribution tests in Step 4 assert (with generous bounds — see below).

## Steps

### Step 1: Confirm the ground truth

Run the drift check from the header. Then read, in full:
`apps/web/src/components/live/use-live-journal.ts`,
`apps/web/src/components/live/types.ts`, lines 240–270 of
`apps/web/src/lib/queries/stats.ts`, and lines 95–145 of `e2e/happy-path.spec.ts`.
Confirm every excerpt in "Current state" matches (line numbers may shift by one
or two; the code must match).

Then confirm no other place renders the live dégommage sentence and no e2e test
asserts it:

**Verify**:
- `grep -rn "a dégommé" apps/web/src e2e packages` → exactly **4** matches:
  `apps/web/src/components/live/use-live-journal.ts:32`,
  `apps/web/src/components/live/use-live-journal.ts:114`,
  `apps/web/src/lib/queries/stats.ts:250`,
  `e2e/happy-path.spec.ts:142`.
- `grep -rn "un pion de" apps/web/src` → exactly the two `use-live-journal.ts`
  lines.
- `pnpm --filter @degommix/web test` → exit 0 (green baseline before you touch
  anything).

### Step 2: Create the deterministic hash

Create `apps/web/src/lib/seq-hash.ts`:

```ts
/**
 * 32-bit integer finalizer used to derive presentation choices from an event's
 * `seq` (the authoritative sequence number attributed by the ws-server).
 *
 * Why not `Math.random()`: game state is replicated, so two phones looking at
 * the same event must render the same text. `seq` is the only value that is
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

Create `apps/web/src/lib/seq-hash.test.ts`:

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

  it('spreads 200 consecutive seqs over at least 190 distinct values', () => {
    const seen = new Set<number>()
    for (let seq = 1; seq <= 200; seq++) seen.add(hashSeq(seq))
    expect(seen.size).toBeGreaterThanOrEqual(190)
  })
})
```

**Verify**: `pnpm --filter @degommix/web test src/lib/seq-hash.test.ts` → exit 0,
4 tests pass.

### Step 3: Create the élision helper

Create `apps/web/src/lib/elision.ts`:

```ts
/**
 * French elision of the preposition « de » before a name: « de Astrid » is
 * wrong, « d’Astrid » is right. Applies before a vowel and before an « h »,
 * which is treated as always mute — a deliberate simplification, since a
 * player-chosen pseudo carries no information about whether its « h » is
 * aspirated, and « d’Hugo » is the far more common case.
 *
 * Uses the typographic apostrophe U+2019, like every other French string in
 * this app.
 */
const ELIDES_BEFORE = /^[aàâäeéèêëiîïoôöuùûüyhAÀÂÄEÉÈÊËIÎÏOÔÖUÙÛÜYH]/

/** Renders « de <name> », elided to « d’<name> » when the name requires it. */
export function deName(name: string): string {
  return ELIDES_BEFORE.test(name) ? `d’${name}` : `de ${name}`
}
```

Create `apps/web/src/lib/elision.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { deName } from './elision'

describe('deName', () => {
  it('elides before a vowel', () => {
    expect(deName('Astrid')).toBe('d’Astrid')
    expect(deName('Obelix')).toBe('d’Obelix')
    expect(deName('idefix')).toBe('d’idefix')
  })

  it('elides before an accented vowel', () => {
    expect(deName('Élodie')).toBe('d’Élodie')
    expect(deName('Ambre')).toBe('d’Ambre')
    expect(deName('Ève')).toBe('d’Ève')
  })

  it('elides before an h, treated as always mute', () => {
    expect(deName('Hugo')).toBe('d’Hugo')
    expect(deName('hector')).toBe('d’hector')
  })

  it('keeps « de » before a consonant', () => {
    expect(deName('Marc')).toBe('de Marc')
    expect(deName('Tristan')).toBe('de Tristan')
    expect(deName('Zoé')).toBe('de Zoé')
  })

  it('keeps « de » before a digit or a symbol', () => {
    expect(deName('42')).toBe('de 42')
    expect(deName('_ghost')).toBe('de _ghost')
  })

  it('keeps « de » for an empty name', () => {
    expect(deName('')).toBe('de ')
  })

  it('uses the typographic apostrophe U+2019', () => {
    expect(deName('Astrid')).toContain('’')
    expect(deName('Astrid')).not.toContain("'")
  })
})
```

**Verify**: `pnpm --filter @degommix/web test src/lib/elision.test.ts` → exit 0,
7 tests pass.

### Step 4 (TEST-FIRST): Write the catalog specification

Create `apps/web/src/lib/degommage-messages.test.ts` **before** the module.
This is the specification; it must fail to compile/run until Step 5 exists.

```ts
import { describe, expect, it } from 'vitest'
import {
  DEGOMMAGE_MESSAGES,
  DEGOMMAGE_TONES,
  TOTAL_WEIGHT,
  pickDegommageIndex,
  renderDegommageJournal,
  renderDegommageTemplate,
  type DegommageTone,
} from './degommage-messages'

const NAME = (userId: string): string => (userId === 'a' ? 'Astrid' : 'Marc')
const LONG = 'Bartholome' // 10 characters, consonant-initial: the worst case

function toneSum(tone: DegommageTone): number {
  return DEGOMMAGE_MESSAGES.filter((m) => m.tone === tone).reduce((s, m) => s + m.weight, 0)
}

describe('catalog shape', () => {
  it('holds exactly 44 messages, 11 per tone', () => {
    expect(DEGOMMAGE_MESSAGES).toHaveLength(44)
    for (const tone of DEGOMMAGE_TONES) {
      expect(DEGOMMAGE_MESSAGES.filter((m) => m.tone === tone)).toHaveLength(11)
    }
  })

  it('holds exactly 10 « sans acteur » messages', () => {
    expect(DEGOMMAGE_MESSAGES.filter((m) => m.sansActeur)).toHaveLength(10)
  })

  it('flags sansActeur exactly when the template omits {acteur}', () => {
    for (const message of DEGOMMAGE_MESSAGES) {
      expect(message.sansActeur).toBe(!message.template.includes('{acteur}'))
    }
  })

  it('always names the target', () => {
    for (const message of DEGOMMAGE_MESSAGES) {
      expect(message.template).toContain('{cible}')
    }
  })

  it('has no duplicate template', () => {
    expect(new Set(DEGOMMAGE_MESSAGES.map((m) => m.template)).size).toBe(44)
  })

  it('gives « sans acteur » messages a strictly lower weight than their tone', () => {
    for (const tone of DEGOMMAGE_TONES) {
      const inTone = DEGOMMAGE_MESSAGES.filter((m) => m.tone === tone)
      const full = inTone.find((m) => !m.sansActeur)
      for (const message of inTone.filter((m) => m.sansActeur)) {
        expect(full).toBeDefined()
        expect(message.weight).toBeLessThan(full?.weight ?? 0)
      }
    }
  })

  it('uses the typographic apostrophe everywhere', () => {
    for (const message of DEGOMMAGE_MESSAGES) {
      expect(message.template).not.toContain("'")
    }
  })
})

describe('tone budget', () => {
  it('totals 484 weight units', () => {
    expect(TOTAL_WEIGHT).toBe(484)
    expect(DEGOMMAGE_MESSAGES.reduce((s, m) => s + m.weight, 0)).toBe(TOTAL_WEIGHT)
  })

  it('splits the budget 286 / 74 / 52 / 72', () => {
    expect(toneSum('baffes')).toBe(286)
    expect(toneSum('toutatis')).toBe(74)
    expect(toneSum('rome')).toBe(52)
    expect(toneSum('chambrage')).toBe(72)
  })

  it('lands within one point of the validated 60 / 15 / 10 / 15 mix', () => {
    const share = (tone: DegommageTone): number => (100 * toneSum(tone)) / TOTAL_WEIGHT
    expect(Math.abs(share('baffes') - 60)).toBeLessThan(1)
    expect(Math.abs(share('toutatis') - 15)).toBeLessThan(1)
    expect(Math.abs(share('rome') - 10)).toBeLessThan(1)
    expect(Math.abs(share('chambrage') - 15)).toBeLessThan(1)
  })
})

describe('length budget', () => {
  it('renders every template in 60 characters or less with two 10-char names', () => {
    const over = DEGOMMAGE_MESSAGES.map((m) => renderDegommageTemplate(m.template, LONG, LONG))
      .filter((text) => text.length > 60)
    expect(over).toEqual([])
  })

  it('keeps the longest worst case at 59 characters', () => {
    const longest = Math.max(
      ...DEGOMMAGE_MESSAGES.map((m) => renderDegommageTemplate(m.template, LONG, LONG).length)
    )
    expect(longest).toBe(59)
  })
})

describe('renderDegommageTemplate', () => {
  it('substitutes both placeholders', () => {
    expect(renderDegommageTemplate('{acteur} met un pion de {cible} au tapis', 'Marc', 'Zoé')).toBe(
      'Marc met un pion de Zoé au tapis'
    )
  })

  it('elides « de » before a vowel-initial target', () => {
    expect(
      renderDegommageTemplate('{acteur} met un pion de {cible} au tapis', 'Marc', 'Astrid')
    ).toBe('Marc met un pion d’Astrid au tapis')
  })

  it('elides « de » before a vowel-initial actor too', () => {
    expect(
      renderDegommageTemplate('La légion de {acteur} bouscule un pion de {cible}', 'Astrid', 'Marc')
    ).toBe('La légion d’Astrid bouscule un pion de Marc')
  })

  it('leaves a « de » that is not followed by a placeholder alone', () => {
    expect(renderDegommageTemplate('Un menhir de trop pour un pion de {cible}', 'Marc', 'Astrid')).toBe(
      'Un menhir de trop pour un pion d’Astrid'
    )
  })
})

describe('pickDegommageIndex', () => {
  it('is deterministic for a given seq', () => {
    for (const seq of [1, 2, 17, 512, 99999]) {
      expect(pickDegommageIndex(seq, null)).toBe(pickDegommageIndex(seq, null))
    }
  })

  it('always returns an index inside the catalog', () => {
    for (let seq = 1; seq <= 500; seq++) {
      const index = pickDegommageIndex(seq, null)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(DEGOMMAGE_MESSAGES.length)
    }
  })

  it('shifts one slot when the pick equals the previous one', () => {
    const raw = pickDegommageIndex(7, null)
    expect(pickDegommageIndex(7, raw)).toBe((raw + 1) % DEGOMMAGE_MESSAGES.length)
  })

  it('does not shift when the previous pick differs', () => {
    const raw = pickDegommageIndex(7, null)
    const other = (raw + 3) % DEGOMMAGE_MESSAGES.length
    expect(pickDegommageIndex(7, other)).toBe(raw)
  })
})

describe('renderDegommageJournal', () => {
  const refs = Array.from({ length: 200 }, (_, i) => ({
    seq: i + 1,
    actorId: i % 2 === 0 ? 'a' : 'b',
    targetId: i % 2 === 0 ? 'b' : 'a',
  }))

  it('returns one label per seq', () => {
    const labels = renderDegommageJournal(refs, NAME)
    expect(labels.size).toBe(200)
    for (const ref of refs) expect(labels.get(ref.seq)).toBeTruthy()
  })

  it('is reproducible — the same refs give the same labels', () => {
    expect([...renderDegommageJournal(refs, NAME)]).toEqual([...renderDegommageJournal(refs, NAME)])
  })

  it('never repeats the same sentence twice in a row', () => {
    const labels = [...renderDegommageJournal(refs, NAME).values()]
    for (let i = 1; i < labels.length; i++) expect(labels[i]).not.toBe(labels[i - 1])
  })

  it('uses all four tones within the first 40 dégommages', () => {
    const first40 = refs.slice(0, 40)
    const tones = new Set<DegommageTone>()
    let previous: number | null = null
    for (const ref of first40) {
      const index = pickDegommageIndex(ref.seq, previous)
      previous = index
      const message = DEGOMMAGE_MESSAGES[index]
      if (message) tones.add(message.tone)
    }
    expect(tones.size).toBe(4)
  })

  it('lets « baffes » dominate over a long run', () => {
    const long = Array.from({ length: 2000 }, (_, i) => ({ seq: i + 1, actorId: 'a', targetId: 'b' }))
    const counts: Record<string, number> = {}
    let previous: number | null = null
    for (const ref of long) {
      const index = pickDegommageIndex(ref.seq, previous)
      previous = index
      const message = DEGOMMAGE_MESSAGES[index]
      if (message) counts[message.tone] = (counts[message.tone] ?? 0) + 1
    }
    const baffes = counts.baffes ?? 0
    expect(baffes / long.length).toBeGreaterThan(0.5)
    expect(baffes / long.length).toBeLessThan(0.7)
    for (const tone of DEGOMMAGE_TONES) expect(counts[tone] ?? 0).toBeGreaterThan(0)
  })

  it('applies élision to the rendered labels', () => {
    const withVowel = renderDegommageJournal([{ seq: 1, actorId: 'a', targetId: 'a' }], () => 'Astrid')
    const label = withVowel.get(1) ?? ''
    expect(label).not.toContain('de Astrid')
  })
})
```

**Verify**: `pnpm --filter @degommix/web test src/lib/degommage-messages.test.ts`
→ **fails** because `./degommage-messages` does not exist yet. That is the
expected red state. Do not proceed until you have seen it fail for that reason
and no other.

Commit: `test(web): specify the degommage message catalog and elision helper`.

### Step 5: Create the catalog and picker

Create `apps/web/src/lib/degommage-messages.ts` with **exactly** this content
(the 44 templates are validated copy — do not edit a single character):

```ts
import { deName } from './elision'
import { hashSeq } from './seq-hash'

/**
 * The four registers of the live journal, and the mix the owner validated:
 * 60 % baffes / 15 % toutatis / 10 % rome / 15 % chambrage. « baffes » is the
 * default voice — short, physical, ageless — so everything else reads as a
 * surprise rather than a gimmick.
 */
export const DEGOMMAGE_TONES = ['baffes', 'toutatis', 'rome', 'chambrage'] as const
export type DegommageTone = (typeof DEGOMMAGE_TONES)[number]

export interface DegommageMessage {
  readonly tone: DegommageTone
  /** French sentence with the `{acteur}` and `{cible}` placeholders. */
  readonly template: string
  /**
   * True when the sentence never names the striker: punchier, but it leans on
   * the bronze character badge next to the line to say who did it. Those carry
   * half their tone's weight so they stay a minority.
   */
  readonly sansActeur: boolean
  /**
   * Relative draw weight. Data, not code: retuning the mix after a playtest is
   * an edit to these numbers, and `degommage-messages.test.ts` re-derives the
   * resulting tone shares so a drift cannot go unnoticed.
   *
   * Full weight per tone: baffes 26, toutatis 9, rome 5, chambrage 8;
   * a `sansActeur` message carries `floor(F / 2)`.
   */
  readonly weight: number
}

export const DEGOMMAGE_MESSAGES: readonly DegommageMessage[] = [
  // ---- I. Baffes historiques — 11 × 26 = 286 (59.1 %) ----
  { tone: 'baffes', template: '{acteur} renvoie un pion de {cible} à l’écurie', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} catapulte un pion de {cible} hors du sentier', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} expédie un pion de {cible} au pré', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} dégomme un pion de {cible}, plein sabot', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} envoie valser un pion de {cible}', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: 'Un pion de {cible} décolle. Signé {acteur}', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} sort un pion de {cible} du décor', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} raccompagne un pion de {cible} à l’étable', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} balaie un pion de {cible} d’un revers', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} met un pion de {cible} au tapis', sansActeur: false, weight: 26 },
  { tone: 'baffes', template: '{acteur} claque des doigts : un pion de {cible} rentre', sansActeur: false, weight: 26 },

  // ---- II. Par Toutatis — 6 × 9 + 5 × 4 = 74 (15.3 %) ----
  { tone: 'toutatis', template: 'Par Toutatis ! {acteur} dégomme un pion de {cible}', sansActeur: false, weight: 9 },
  { tone: 'toutatis', template: 'Le ciel tombe sur la tête d’un pion de {cible}', sansActeur: true, weight: 4 },
  { tone: 'toutatis', template: '{acteur} invoque Épona : un pion de {cible} rentre', sansActeur: false, weight: 9 },
  { tone: 'toutatis', template: 'Par Bélénos, {cible} y laisse un pion', sansActeur: true, weight: 4 },
  { tone: 'toutatis', template: '{acteur} sonne le carnyx, {cible} recule d’un pion', sansActeur: false, weight: 9 },
  { tone: 'toutatis', template: 'Un menhir de trop pour un pion de {cible}', sansActeur: true, weight: 4 },
  { tone: 'toutatis', template: 'Épona rappelle un pion de {cible} à l’écurie', sansActeur: true, weight: 4 },
  { tone: 'toutatis', template: 'Le sanglier pour {acteur}, l’écurie pour {cible}', sansActeur: false, weight: 9 },
  { tone: 'toutatis', template: '{acteur} fait tomber le ciel sur un pion de {cible}', sansActeur: false, weight: 9 },
  { tone: 'toutatis', template: '{acteur} pousse le cri, {cible} perd un pion', sansActeur: false, weight: 9 },
  { tone: 'toutatis', template: 'Toutatis a tranché : {cible} rentre un pion', sansActeur: true, weight: 4 },

  // ---- III. Rome antique — 10 × 5 + 1 × 2 = 52 (10.7 %) ----
  { tone: 'rome', template: 'Veni, vidi, dégommé : {acteur} contre {cible}', sansActeur: false, weight: 5 },
  { tone: 'rome', template: '{cible} mord la poussière de l’arène', sansActeur: true, weight: 2 },
  { tone: 'rome', template: '{acteur} fête son triomphe, {cible} rentre à pied', sansActeur: false, weight: 5 },
  { tone: 'rome', template: 'Ave {acteur} ! Un pion de {cible} quitte l’arène', sansActeur: false, weight: 5 },
  { tone: 'rome', template: 'La légion de {acteur} bouscule un pion de {cible}', sansActeur: false, weight: 5 },
  { tone: 'rome', template: '{acteur} baisse le pouce : un pion de {cible} sort', sansActeur: false, weight: 5 },
  { tone: 'rome', template: '{acteur} repousse un pion de {cible} hors du limes', sansActeur: false, weight: 5 },
  { tone: 'rome', template: 'Aux lions ! {acteur} dégomme un pion de {cible}', sansActeur: false, weight: 5 },
  { tone: 'rome', template: '{acteur} plante l’aigle, {cible} plie bagage', sansActeur: false, weight: 5 },
  { tone: 'rome', template: '{acteur} trace sa voie, {cible} perd un pion', sansActeur: false, weight: 5 },
  { tone: 'rome', template: 'Un pion de {cible} part aux galères. Merci {acteur}', sansActeur: false, weight: 5 },

  // ---- IV. Chambrage de table — 7 × 8 + 4 × 4 = 72 (14.9 %) ----
  { tone: 'chambrage', template: '{cible} peut retourner s’entraîner', sansActeur: true, weight: 4 },
  { tone: 'chambrage', template: '{acteur} range un pion de {cible}. De rien.', sansActeur: false, weight: 8 },
  { tone: 'chambrage', template: '{acteur} dégomme un pion de {cible}. Aucun regret.', sansActeur: false, weight: 8 },
  { tone: 'chambrage', template: 'Petit détour par l’écurie pour {cible}', sansActeur: true, weight: 4 },
  { tone: 'chambrage', template: '{cible} recompte ses pions. Il en manque un.', sansActeur: true, weight: 4 },
  { tone: 'chambrage', template: '{acteur} dégomme un pion de {cible} et sifflote', sansActeur: false, weight: 8 },
  { tone: 'chambrage', template: '{cible} avait dit « je gère ». Raté.', sansActeur: true, weight: 4 },
  { tone: 'chambrage', template: '{acteur} n’a pas hésité. {cible} rentre un pion.', sansActeur: false, weight: 8 },
  { tone: 'chambrage', template: 'Un pion de {cible} rentre. {acteur} regarde ailleurs.', sansActeur: false, weight: 8 },
  { tone: 'chambrage', template: '{cible} perd un pion, {acteur} perd son sérieux', sansActeur: false, weight: 8 },
  { tone: 'chambrage', template: 'Coup du sort pour {cible}, coup de {acteur} en vrai', sansActeur: false, weight: 8 },
]

/** Sum of every weight — the modulus of the weighted walk. */
export const TOTAL_WEIGHT = DEGOMMAGE_MESSAGES.reduce((sum, message) => sum + message.weight, 0)

/** `de {acteur}` / `de {cible}`, the only spots where élision applies. */
const ELIDABLE_PLACEHOLDER = /\bde \{(acteur|cible)\}/g

/**
 * Fills a template. `de {nom}` becomes `d’<nom>` before a vowel or an « h »
 * (see `elision.ts`); the remaining placeholders are substituted as-is.
 */
export function renderDegommageTemplate(template: string, acteur: string, cible: string): string {
  return template
    .replace(ELIDABLE_PLACEHOLDER, (_match, key: string) => deName(key === 'acteur' ? acteur : cible))
    .split('{acteur}')
    .join(acteur)
    .split('{cible}')
    .join(cible)
}

/**
 * Weighted walk over the catalog, seeded by the event's `seq` so every phone
 * lands on the same sentence — after a reload, after a late resync, forever.
 *
 * `previousIndex` is the index picked for the *previous* dégommage of the same
 * game; when the walk lands on it again the pick shifts one slot forward, which
 * keeps the result deterministic while making an immediate repeat impossible.
 */
export function pickDegommageIndex(seq: number, previousIndex: number | null): number {
  let remaining = hashSeq(seq) % TOTAL_WEIGHT
  let index = DEGOMMAGE_MESSAGES.length - 1
  for (let i = 0; i < DEGOMMAGE_MESSAGES.length; i++) {
    const message = DEGOMMAGE_MESSAGES[i]
    if (!message) break
    remaining -= message.weight
    if (remaining < 0) {
      index = i
      break
    }
  }
  return index === previousIndex ? (index + 1) % DEGOMMAGE_MESSAGES.length : index
}

/** One dégommage, reduced to what the picker needs. */
export interface DegommageRef {
  readonly seq: number
  readonly actorId: string
  readonly targetId: string
}

/**
 * Renders the sentence of every dégommage of a game, in `seq` order, as a
 * `seq → label` lookup. Folding over the whole ordered list (rather than
 * picking per event in isolation) is what makes the no-immediate-repeat rule
 * reproducible: the same list always yields the same labels, on every device.
 *
 * Undone dégommages keep their sentence — an `UNDO` appends its own generic
 * line, it never rewrites history.
 */
export function renderDegommageJournal(
  refs: readonly DegommageRef[],
  name: (userId: string) => string
): Map<number, string> {
  const labels = new Map<number, string>()
  let previousIndex: number | null = null
  for (const ref of refs) {
    const index = pickDegommageIndex(ref.seq, previousIndex)
    previousIndex = index
    const message = DEGOMMAGE_MESSAGES[index]
    if (!message) continue
    labels.set(ref.seq, renderDegommageTemplate(message.template, name(ref.actorId), name(ref.targetId)))
  }
  return labels
}
```

**Verify**: `pnpm --filter @degommix/web test src/lib/degommage-messages.test.ts`
→ exit 0, all tests pass (26 tests). If the "keeps the longest worst case at 59
characters" test fails, a template was mistyped — diff it against the array
above rather than relaxing the assertion.

### Step 6: Wire the live journal, fix élision in both journals, adapt the one e2e assertion

**6a — `apps/web/src/components/live/use-live-journal.ts`**

1. Add the imports next to the existing ones:

```ts
import { renderDegommageJournal, type DegommageRef } from '@/lib/degommage-messages'
import { deName } from '@/lib/elision'
```

2. Change `describeEvent` to take the pre-computed label lookup, and use
   `deName` in the undo sentence:

```ts
function describeEvent(
  event: GameEvent,
  events: GameEvent[],
  names: NameMap,
  degommageLabels: Map<number, string>
): string | null {
  switch (event.type) {
    case 'DEGOMMAGE':
      return (
        degommageLabels.get(event.seq) ??
        `${displayName(names, event.actorId)} a dégommé un pion de ${deName(displayName(names, event.targetId))}`
      )
    case 'UNDO': {
      const undone = events.find((e) => e.seq === event.payload.targetSeq && e.type === 'DEGOMMAGE')
      if (!undone || undone.type !== 'DEGOMMAGE') {
        return `${displayName(names, event.actorId)} a annulé la dernière action`
      }
      return `${displayName(names, event.actorId)} a annulé le dégommage ${deName(displayName(names, undone.actorId))} sur ${displayName(names, undone.targetId)}`
    }
```

Note the `??` fallback: if a future catalog edit ever drops an id the journal
degrades to the (now correctly elided) factual sentence instead of rendering
nothing. That safety net is required by the design artifact: « si un identifiant
de texte disparaît du catalogue après une mise à jour, l'affichage retombe sur
la phrase neutre au lieu de casser ».

Leave `PLAYER_QUIT`, `END_REQUESTED`, `END_REJECTED` and the `null` cases
**exactly** as they are.

3. In the `useMemo`, build the ordered dégommage refs first, then the labels,
   then pass them down; the fallback path uses the same lookup:

```ts
  return useMemo(() => {
    void version
    const events = [...eventsRef.current.values()].sort((a, b) => a.seq - b.seq)
    const eventRefs: DegommageRef[] = events
      .filter((e) => e.type === 'DEGOMMAGE')
      .map((e) => ({ seq: e.seq, actorId: e.actorId, targetId: e.targetId as string }))
    const fallbackRefs: DegommageRef[] = state ? state.degommageLog : []
    const degommageLabels = renderDegommageJournal(
      eventRefs.length > 0 ? eventRefs : fallbackRefs,
      (userId) => displayName(names, userId)
    )
    const entries: JournalEntry[] = []
    for (const event of events) {
      const label = describeEvent(event, events, names, degommageLabels)
      if (label) entries.push({ seq: event.seq, actorId: event.actorId, label })
    }
    if (entries.length === 0 && state) {
      for (const entry of state.degommageLog) {
        if (state.undoneSeqs.has(entry.seq)) continue
        entries.push({
          seq: entry.seq,
          actorId: entry.actorId,
          label:
            degommageLabels.get(entry.seq) ??
            `${displayName(names, entry.actorId)} a dégommé un pion de ${deName(displayName(names, entry.targetId))}`,
        })
      }
    }
    const last = events[events.length - 1]
    return {
      entries: entries.slice(-JOURNAL_LENGTH).reverse(),
      lastEventAt: last?.createdAt ?? null,
    }
  }, [version, state, names])
```

If `e.targetId as string` offends you (it should), narrow properly instead —
the discriminated union already guarantees `targetId: string` for `DEGOMMAGE`,
so a typed filter works and is preferred:

```ts
    const eventRefs: DegommageRef[] = []
    for (const event of events) {
      if (event.type === 'DEGOMMAGE') {
        eventRefs.push({ seq: event.seq, actorId: event.actorId, targetId: event.targetId })
      }
    }
```

Use that form. **No `as` casts anywhere.**

**Crucially**: the refs list must be the *full* ordered dégommage list, not the
two lines being displayed. Slicing to the last two would make the no-repeat
shift depend on how many events happen to be in memory, and two phones with
different reconnection histories would then disagree. The snapshot replay
(`game:state_snapshot`, lines 88–91) is what guarantees the full list is
present.

**6b — `apps/web/src/lib/queries/stats.ts`**

Add the import at the top of the file, next to the existing imports:

```ts
import { deName } from '@/lib/elision'
```

Then change **only** the undo return (currently line 255):

```ts
      return `${name(event.actorId)} a annulé le dégommage ${deName(name(target.actorId))} sur ${name(target.targetId)}`
```

Do **not** touch line 250 (`a dégommé ${name(event.targetId)}`), the
`GAME_STARTED`, `PLAYER_QUIT`, `END_REQUESTED`, `END_REJECTED`, `END_VALIDATED`
or `GAME_AUTO_CLOSED` branches.

**6c — `e2e/happy-path.spec.ts`**

The detail-page undo assertion now renders with élision (`Asterix` starts with a
vowel). Replace **only** this assertion (currently lines 140–142):

```ts
    await expect(
      p1.getByText(`${J2.username} a annulé le dégommage de ${J1.username} sur ${J2.username}`)
    ).toBeVisible()
```

with:

```ts
    // « de Asterix » is elided to « d’Asterix » (see apps/web/src/lib/elision.ts).
    await expect(
      p1.getByText(`${J2.username} a annulé le dégommage d’${J1.username} sur ${J2.username}`)
    ).toBeVisible()
```

Note the typographic apostrophe `’` (U+2019). Change nothing else in that file:
in particular the live-journal undo assertions on lines 102–103 already match
(the regex stops before the name) and the `a dégommé ${J2.username}` count on
lines 138–140 is the detail page, which is unchanged.

**Verify**:
- `pnpm typecheck` → exit 0.
- `pnpm lint` → exit 0.
- `pnpm --filter @degommix/web test` → exit 0.
- `grep -rn "un pion de \${" apps/web/src` → no matches (the raw template
  literal is gone from `use-live-journal.ts`; the two remaining occurrences use
  `deName(...)`).
- `grep -rn "le dégommage de " apps/web/src e2e` → **no matches**.

Commit: `feat(web): deterministic degommage sentences in the live journal` then
`fix(web): elide « de » before vowel-initial names in both journals` (or one
commit if you prefer; keep the message conventional and in English).

### Step 7: Full verification

From the repo root:

1. `pnpm --filter @degommix/web test` → exit 0.
2. `pnpm typecheck` → exit 0.
3. `pnpm lint` → exit 0.
4. `docker compose -f docker-compose.test.yml up -d` then
   `pnpm exec turbo run test --concurrency=1` → exit 0. (If Docker is
   unavailable, say so explicitly in your report; do not claim the suite
   passed.)
5. `docker compose -f docker-compose.test.yml up -d` then `pnpm test:e2e` →
   exit 0.
6. `git status --porcelain` → only the in-scope files.

**Verify**: paste the actual tail of each command's output in your report.

### Step 8: Visual check on the running app

The catalog is copy: it has to be *looked at* on a phone-sized screen. There is
no component-test infrastructure in this repo, so this step is manual and
required.

Start an isolated stack (own database and ports, so it cannot collide with a
dev stack already running):

```bash
# Dedicated Postgres for this check, on a free port
docker run -d --name degommix-plan010 \
  -e POSTGRES_USER=degommix -e POSTGRES_PASSWORD=degommix -e POSTGRES_DB=degommix_test \
  -e LANG=en_US.utf8 -e POSTGRES_INITDB_ARGS="--locale=en_US.UTF-8" \
  -p 54401:5432 postgres:16

export DATABASE_URL=postgres://degommix:degommix@localhost:54401/degommix_test
export BETTER_AUTH_SECRET=plan010-secret-0123456789-abcdefghij
export BETTER_AUTH_URL=http://localhost:3010
export NEXT_PUBLIC_WS_URL=http://localhost:4011
export WEB_ORIGIN=http://localhost:3010
export PORT=4011

pnpm --filter @degommix/db db:migrate
pnpm --filter @degommix/ws-server exec tsx src/index.ts &     # ws-server on :4011
pnpm --filter @degommix/web exec next dev -p 3010             # web on :3010
```

(The variable names and their meanings come from `.env.example`: `DATABASE_URL`,
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_WS_URL`, `WEB_ORIGIN`,
`PORT`. The ws-server does not read a `.env` file — its variables must be in the
process environment.)

Then, with two browser profiles at a 390 × 844 viewport (the e2e viewport, see
`e2e/playwright.config.ts`), accounts A and B already friends:

1. A creates a 1v1 lobby, invites B, both pick a character, A starts.
2. A taps B's chip **eight times in a row**, pausing ~2 s between taps (the tap
   lock holds a chip for 1.2 s).
   - **Expected**: eight different sentences. No two consecutive lines identical.
     Most lines are « baffes » (physical, short); a « Par Toutatis », a Roman one
     and a chambrage one show up. Every line fits on one row without wrapping to
     a third journal line.
   - **Expected on B's phone**: the exact same eight sentences, in the same
     order.
3. Reload A's page (hard refresh).
   - **Expected**: the two journal lines still read exactly as before the
     reload.
4. Use a pseudo starting with a vowel for one account (e.g. `Astrid`) and
   confirm the journal says « … d'Astrid … », never « … de Astrid … ».
5. Tap « Annuler la dernière action ».
   - **Expected**: the undo line is the sober factual one, « X a annulé le
     dégommage d'Y sur Z », visibly different in tone from the lines around it.
6. Finish the game, then open `/parties/<id>`.
   - **Expected**: the detail journal is entirely factual — « X a dégommé Y »,
     never a catalog sentence.
7. Screenshots to attach to your report: `plan010-live-journal-light.png`,
   `plan010-live-journal-dark.png` (toggle the theme), and
   `plan010-detail-journal.png`.

Tear down: `docker rm -f degommix-plan010`.

## Test plan

All tests are pure TypeScript, `vitest`, node environment, co-located with the
source. Structural pattern: `apps/web/src/lib/api-payloads.test.ts`.

| File | Cases |
|---|---|
| `apps/web/src/lib/seq-hash.test.ts` | determinism; unsigned 32-bit range; consecutive seqs differ; spread over 200 seqs |
| `apps/web/src/lib/elision.test.ts` | vowel; accented `É`/`È`; mute `h`; consonant; digit/symbol; empty; U+2019 apostrophe |
| `apps/web/src/lib/degommage-messages.test.ts` | 44 messages / 11 per tone; 10 `sansActeur`; the flag matches the template; `{cible}` always present; no duplicates; `sansActeur` weight strictly lower; no ASCII apostrophe; `TOTAL_WEIGHT === 484`; per-tone sums 286/74/52/72; mix within 1 point of 60/15/10/15; **every template ≤ 60 chars with two 10-char names**; longest worst case is exactly 59; template rendering with and without élision; determinism of `pickDegommageIndex`; index in range; the no-repeat shift and its absence; one label per seq; reproducibility; **no two consecutive identical labels over 200 dégommages**; all four tones within the first 40; baffes between 50 % and 70 % over 2000 |

Undo behaviour is covered by the unchanged e2e assertions on lines 102–103 plus
the updated detail-page assertion. No new e2e test is added.

Verification: `pnpm --filter @degommix/web test` → exit 0, 37 new tests pass on
top of the existing suite.

## Done criteria

Machine-checkable unless marked MANUAL. ALL must hold:

- [ ] `pnpm --filter @degommix/web test src/lib/seq-hash.test.ts` exits 0 (4 tests)
- [ ] `pnpm --filter @degommix/web test src/lib/elision.test.ts` exits 0 (7 tests)
- [ ] `pnpm --filter @degommix/web test src/lib/degommage-messages.test.ts` exits 0 (26 tests)
- [ ] `pnpm --filter @degommix/web test` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm exec turbo run test --concurrency=1` exits 0 with the test DB up (or the report states Docker was unavailable)
- [ ] `pnpm test:e2e` exits 0
- [ ] `grep -c "{ tone: ..." apps/web/src/lib/degommage-messages.ts` returns `44`
- [ ] `grep -rn "le dégommage de " apps/web/src e2e` returns no matches
- [ ] `grep -rn "Math.random" apps/web/src/lib/degommage-messages.ts apps/web/src/components/live/` returns no matches
- [ ] `grep -rn "a dégommé" apps/web/src/lib/queries/stats.ts` still returns the factual detail-page line
- [ ] `git diff --name-only e772284..HEAD` lists only files from the "In scope" list
- [ ] `git status --porcelain` shows no modification outside the in-scope list
- [ ] `plans/README.md` row for 010 added/updated
- [ ] **MANUAL**: Step 8 performed, its 7 checks reported one by one, and the three screenshots attached

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts — the
  codebase drifted since commit `e772284`.
- `grep -rn "a dégommé" apps/web/src e2e packages` in Step 1 returns more or
  fewer than the four documented matches: another surface renders the sentence
  and the "live journal only" boundary needs re-deciding, not guessing.
- The catalog tests demand a template change to pass. The 44 sentences are
  validated copy; a failing length or apostrophe test means **you** mistyped
  one. Diff against Step 5 rather than editing the sentence.
- You conclude the chosen message must be persisted (a column, an event payload
  field, a ws broadcast) for phones to agree. It must not: `seq` is already
  replicated and authoritative. If you believe otherwise, report the reasoning
  instead of touching `packages/game-core`, `packages/db` or `apps/ws-server`.
- The e2e suite fails on any assertion other than the single detail-page undo
  line fixed in Step 6c — in particular if a *live-journal* assertion fails,
  because that would mean a dégommage sentence is being asserted somewhere this
  plan did not find.
- Any step's verification fails twice after a reasonable fix attempt.
- The assumption "`seq` is identical on every client for the same dégommage"
  turns out to be false.

## Maintenance notes

For whoever owns this code next:

- **What a reviewer should scrutinize**: (1) that `renderDegommageJournal` is
  fed the *complete* ordered dégommage list and never a slice — that is the
  whole determinism argument; (2) that nothing about the chosen text is
  persisted or broadcast; (3) that `stats.ts` still renders the factual
  sentence; (4) that the two-line journal never grows a third line.
- **Retuning the mix** is a data edit: change the `weight` values in
  `DEGOMMAGE_MESSAGES`, run the tests, and update the expected per-tone sums in
  `degommage-messages.test.ts`. The artifact's own advice, if one cursor has to
  move after the next playtest: lower « chambrage », because it is the tone that
  ages fastest when it keeps landing on the same person.
- **Adding a sentence** means updating three test expectations (44 → 45, the
  per-tone count, the tone sum). That friction is intentional: the length and
  mix budgets are the only things keeping the journal readable.
- **`seq-hash.ts` is shared.** Plan 011 (« dégommage hit animation ») picks its
  onomatopée with the same `hashSeq`, for the same reason. If you change the
  mix function, both surfaces change at once — which is correct (they are
  independent choices seeded from the same number), but it will make previously
  played games render differently on a re-read. That is acceptable for the live
  journal (ephemeral) and irrelevant for the detail page (factual).
- **Deferred on purpose**: no per-player tone preference, no "mute the jokes"
  setting, no localisation. The app is French-only by design and the journal is
  a two-line ephemeral surface; a settings toggle would cost more than it buys.
- **Interaction with plan 011**: 011 touches `player-card.tsx`,
  `live-screen.tsx` and `globals.css` and creates `apps/web/src/lib/seq-hash.ts`
  if this plan has not landed yet. The two plans overlap on exactly that one
  file and it is created identically by both, so they can land in either order —
  but if both are in flight, land this one first and let 011 import the existing
  module.
