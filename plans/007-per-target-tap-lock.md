# Plan 007: Lock only the tapped dégommage chip, not every chip

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 094ddfd..HEAD -- apps/web/src/components/live/tap-lock.ts apps/web/src/components/live/tap-lock.test.ts apps/web/src/components/live/use-tap-lock.ts apps/web/src/components/live/tap-zone.tsx apps/web/src/components/live/live-screen.tsx apps/web/src/hooks/use-game.ts apps/web/src/lib/socket.ts`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S-M
- **Risk**: MED
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `094ddfd`, 2026-07-25

## Why this matters

Dégommix is a companion app for a physical board game: a player taps an
opponent's chip once per pawn they just sent back to the stable. After playtest
round 1, commit `308d00b` (`fix(web): lock degommage chips during ack plus 1.2s
cooldown against double taps`) fixed real accidental double-taps by locking
**every** chip for at least 1200 ms after any tap. That fix is correct about
bounce taps but too broad: in a 3- or 4-player game, tapping Obélix also freezes
Astérix and Panoramix for ≥1.2 s, so two dégommages on two *different*
opponents — a normal outcome of one turn on the physical board — have to be
entered one at a time with a wait in between, while the table has already moved
on.

This plan narrows the lock to the tapped chip: chip A locks for its own
ack+cooldown window, chip B stays tappable. Bounce taps physically land on the
same chip, so the regression from playtest round 1 stays fixed.

**Be precise about the limit, and do not try to fix it here**: two dégommages on
the *same* opponent (two of their pawns in one move) still require waiting out
the 1.2 s cooldown. That case is indistinguishable from a bounce tap with the
data we have, so it is deliberately left as-is — see "Maintenance notes". The
win in this plan is removing the cross-target freeze, not removing the
per-target floor.

## Current state

Files involved, and their role:

- `apps/web/src/components/live/tap-lock.ts` — framework-agnostic lock store
  (the whole file is 95 lines). Holds the global lock.
- `apps/web/src/components/live/tap-lock.test.ts` — the existing
  characterization tests for that store (pure unit tests, `vitest`, fake
  timers). This is the harness you extend.
- `apps/web/src/components/live/use-tap-lock.ts` — React binding via
  `useSyncExternalStore`.
- `apps/web/src/components/live/tap-zone.tsx` — the « Tu viens de dégommer
  qui ? » chip row; consumes `pendingTargetId` + `isLocked`.
- `apps/web/src/components/live/live-screen.tsx` — owns the hook and the tap
  handler; sends the command and settles the lock.
- `apps/web/src/hooks/use-game.ts` and `apps/web/src/lib/socket.ts` — the emit
  path. **Read-only here**, but you must confirm the excerpts below: they are
  the reason concurrent in-flight commands are safe.

### `apps/web/src/components/live/tap-lock.ts`

Module doc, lines 1–11 (verbatim):

```ts
/**
 * Anti double-tap lock for the dégommage chips (post-playtest round 1):
 * accidental bounce taps were registering two dégommages. A tap locks every
 * chip until the server ack resolved AND a minimum cooldown elapsed, whichever
 * is longer. A rejected ack releases the lock immediately so the player can
 * retry without waiting. A legit double dégommage stays possible, one tap at a
 * time.
 */

/** Minimum lockout after a tap — long enough to swallow a bounce tap. */
export const TAP_LOCK_COOLDOWN_MS = 1200
```

Snapshot shape and idle value, lines 13–22:

```ts
export interface TapLockSnapshot {
  /** Chip currently being confirmed by the server, `null` when idle. */
  pendingTargetId: string | null
  /** True while every chip is locked. */
  isLocked: boolean
}

type Listener = () => void

const IDLE: TapLockSnapshot = { pendingTargetId: null, isLocked: false }
```

The global refusal and the single shared timer, lines 26–66:

```ts
export class TapLock {
  private readonly cooldownMs: number
  private readonly listeners = new Set<Listener>()
  private snapshot: TapLockSnapshot = IDLE
  private timer: ReturnType<typeof setTimeout> | null = null
  private ackSettled = true
  ...
  readonly begin = (targetId: string): boolean => {
    if (this.snapshot.isLocked) return false
    this.ackSettled = false
    this.timer = setTimeout(this.onCooldownElapsed, this.cooldownMs)
    this.publish({ pendingTargetId: targetId, isLocked: true })
    return true
  }

  readonly settle = (ok: boolean): void => {
    if (!this.snapshot.isLocked) return
    this.ackSettled = true
    if (ok && this.timer !== null) return
    this.release()
  }
```

Line 50 (`if (this.snapshot.isLocked) return false`) is the whole problem: the
refusal does not look at `targetId`.

### `apps/web/src/components/live/use-tap-lock.ts` (whole file, 31 lines)

Lines 6–11 and 24–30:

```ts
export interface UseTapLockResult extends TapLockSnapshot {
  /** Registers a tap — `false` means it was swallowed as a double tap. */
  begin: (targetId: string) => boolean
  /** Resolves the pending tap with the server ack result. */
  settle: (ok: boolean) => void
}
...
  const { pendingTargetId, isLocked } = useSyncExternalStore(
    lock.subscribe,
    lock.getSnapshot,
    lock.getSnapshot
  )

  return { pendingTargetId, isLocked, begin: lock.begin, settle: lock.settle }
```

### `apps/web/src/components/live/tap-zone.tsx`

Props, lines 9–18:

```tsx
interface TapZoneProps {
  /** Opponents still in game — one chip each, one tap = one degommage. */
  opponents: PlayerState[]
  names: NameMap
  onTap: (targetId: string) => void
  /** Chip whose degommage is being confirmed by the server, `null` when idle. */
  pendingTargetId: string | null
  /** True while the anti double-tap lock holds every chip (see `tap-lock.ts`). */
  isLocked: boolean
}
```

Rendering, lines 36–58 — note `disabled={isLocked}` on line 42 and the
`opacity-40` dimming of every non-pending chip on line 55:

```tsx
        {opponents.map((opponent) => {
          const meta = CHARACTER_META[opponent.character]
          const isPending = opponent.userId === pendingTargetId
          return (
            <button
              key={opponent.userId}
              type="button"
              disabled={isLocked}
              aria-busy={isPending}
              data-state={isPending ? 'confirming' : isLocked ? 'locked' : 'idle'}
              onClick={() => {
                onTap(opponent.userId)
              }}
              className={[
                CHIP_BASE,
                isLocked
                  ? 'cursor-default'
                  : 'cursor-pointer active:scale-90 motion-reduce:active:scale-100',
                isPending ? 'scale-95 opacity-80 motion-reduce:scale-100' : '',
                isLocked && !isPending ? 'opacity-40' : '',
              ]
```

The chip label is a fixed `+1` span at line 70:
`<span style={{ color: meta.colorVar }}>+1</span>`. Leave it alone (see "Out of
scope").

### `apps/web/src/components/live/live-screen.tsx`

Tap handler, lines 79–85:

```tsx
  /** Anti double-tap: a tap locks every chip until the ack and the cooldown. */
  const handleTap = async (targetId: string): Promise<void> => {
    if (!tapLock.begin(targetId)) return
    const ack = await game.degommage(targetId)
    tapLock.settle(ack.ok)
    if (!ack.ok) toast(ackErrorMessage(ack), 'error')
  }
```

Render site, lines 147–157:

```tsx
      {canAct ? (
        <TapZone
          opponents={opponents}
          names={names}
          pendingTargetId={tapLock.pendingTargetId}
          isLocked={tapLock.isLocked}
          onTap={(targetId) => {
            void handleTap(targetId)
          }}
        />
      ) : null}
```

### Why concurrent in-flight commands are safe (verified — confirm, don't assume)

`apps/web/src/hooks/use-game.ts:101-112` — every command gets a **fresh** UUID
and there is no shared in-flight slot, mutex or queue:

```ts
  const sendCommand = useCallback(
    (command: Command): Promise<CommandAck> => {
      if (!socket) return Promise.resolve(timeoutAck())
      return sendGameCommand(socket, gameId, crypto.randomUUID(), command)
    },
    [socket, gameId]
  )

  const degommage = useCallback(
    (targetId: string) => sendCommand({ type: 'degommage', targetId }),
    [sendCommand]
  )
```

`apps/web/src/lib/socket.ts:102-120` — `sendGameCommand` is a plain per-call
async function (retry loop over its *own* payload only; `COMMAND_RETRY_TIMEOUT_MS
= 3_000`, `COMMAND_RETRY_ATTEMPTS = 3`, so a pending ack can hold a chip for up
to ~10 s — one more reason not to freeze the other chips):

```ts
/**
 * Sends a game command with the short-retry policy of design §4.5: the same
 * `clientEventId` is re-emitted when no ack arrives within 3s, 3 attempts max
 * (~10s). The server is idempotent on `clientEventId`, so a retry of an
 * already-persisted tap acks with the existing seq without double-counting.
 */
export async function sendGameCommand(
  socket: AppSocket | AckEmitter,
  gameId: string,
  clientEventId: string,
  command: Command
): Promise<Ack<{ seq: number }>> {
```

`apps/ws-server/src/game-manager.ts:41-45` (class doc) and `:99-104` — the
server serializes commands per game and de-duplicates on `clientEventId`, so
ordering and idempotency do not depend on the client sending one at a time:

```ts
/**
 * Authoritative write path for game events. One in-memory promise chain per
 * gameId acts as a mutex: a single command is processed at a time per game,
 * which makes seq attribution and undo-target resolution race-free.
 */
```

**Conclusion you may rely on**: two dégommages in flight at once, to two
different targets, are safe. Nothing in the socket layer needs to change.

### Design constraints to honor (quoted — you have not read these docs)

- `SPECS.md:105`: « Action principale : **« Tu viens de dégommer qui ? »** —
  chacun loggue **ses propres** dégommages, **un tap par pion dégommé** (2 pions
  = 2 taps), sur le portrait de l'adversaire concerné. Pas de confirmation
  (l'undo est le garde-fou), pas d'auto-dégommage (on ne se dégomme pas
  soi-même). Pas de saisie manuelle de score. »
  → One tap = one pawn stays the model. Do **not** introduce a quantity picker,
  a `+2` button, or a confirmation dialog.
- `docs/superpowers/specs/2026-07-25-degommix-design.md:307` (§5.2 Live):
  « Zone « Tu viens de dégommer qui ? » : portraits des adversaires en jeu, 1 tap
  = 1 pion, sans confirmation. »
- All code, comments and commit messages in **English**; French only in
  user-facing copy, which must stay byte-identical to what is quoted above from
  the current files.

### Repo conventions that apply

- TypeScript strict, no `any`, immutable data (`readonly` arrays over mutation
  in public shapes).
- Tests are co-located `*.test.ts` next to the source, run by `vitest` in a
  **node** environment: `apps/web/vitest.config.ts` sets
  `environment: 'node'` and `include: ['src/**/*.test.ts']`.
  There is **no** `@testing-library/react` in `apps/web/package.json` — do not
  write React component tests, and do not add test dependencies. All new tests
  in this plan go in the existing pure-TS `tap-lock.test.ts`.
- Model your new tests on the existing structure of
  `apps/web/src/components/live/tap-lock.test.ts` (`vi.useFakeTimers()` in
  `beforeEach`, `vi.advanceTimersByTime`, `expect(...).toEqual(...)` on
  snapshots).

## Commands you will need

| Purpose            | Command                                                                             | Expected on success                  |
|--------------------|-------------------------------------------------------------------------------------|--------------------------------------|
| Install            | `pnpm install`                                                                      | exit 0                               |
| Unit tests (fast)  | `pnpm --filter @degommix/web test src/components/live/tap-lock.test.ts`              | exit 0, all tests pass               |
| All web unit tests | `pnpm --filter @degommix/web test`                                                   | exit 0                               |
| Typecheck (repo)   | `pnpm typecheck`                                                                     | exit 0, no errors                    |
| Lint (repo)        | `pnpm lint`                                                                          | exit 0                               |
| Full test suite    | `docker compose -f docker-compose.test.yml up -d` then `pnpm exec turbo run test --concurrency=1` | exit 0 (integration suites need the DB; `--concurrency=1` avoids DB contention) |
| E2E (optional)     | `docker compose -f docker-compose.test.yml up -d` then `pnpm test:e2e`               | exit 0 — `e2e/happy-path.spec.ts` taps the same chip twice in a row |

Package manager is `pnpm@11.13.1`, Node ≥ 22, Turborepo. Run all commands from
the repository root.

## Suggested executor toolkit

- Invoke `superpowers:test-driven-development` before step 2 — this plan is
  test-first by mandate.
- Invoke `superpowers:verification-before-completion` before reporting done:
  every claim needs real command output.
- If available, use `context7` to check the React 19 `useSyncExternalStore`
  contract before changing the snapshot shape (the store must return a
  referentially stable snapshot between publishes — the design below satisfies
  that by rebuilding the snapshot object only inside `publish()`).

## Scope

**In scope** (the only files you may modify):

- `apps/web/src/components/live/tap-lock.ts`
- `apps/web/src/components/live/tap-lock.test.ts`
- `apps/web/src/components/live/use-tap-lock.ts`
- `apps/web/src/components/live/tap-zone.tsx`
- `apps/web/src/components/live/live-screen.tsx`
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/lib/socket.ts`, `apps/web/src/hooks/use-game.ts` — the emit
  path is already per-command and safe; changing it is what this plan is
  explicitly designed to avoid.
- `apps/ws-server/**`, `packages/game-core/**` — server behaviour, idempotency
  and validation are unchanged; a client-side lock is a UX guard, never the
  correctness guarantee.
- `TAP_LOCK_COOLDOWN_MS = 1200` — do **not** tune the value. It came out of a
  physical playtest; only its *scope* changes in this plan.
- The `+1` chip label, any quantity/batching UI, any confirmation dialog —
  forbidden by `SPECS.md:105`.
- `e2e/happy-path.spec.ts` — it must keep passing **unmodified**. It taps the
  same chip twice consecutively (`e2e/happy-path.spec.ts:90-93`); Playwright
  waits for the chip to be enabled again, which still works with a per-target
  lock. If you feel the need to edit it, that is a STOP condition.
- French UI copy — no wording changes anywhere.

## Git workflow

- Branch: `fix/per-target-tap-lock` (repo convention is `type/short-slug`, e.g.
  the current branch `fix/post-playtest-round-1`).
- Conventional Commits in English, one commit per logical unit. Example from
  `git log` (commit `308d00b`, the change this plan revisits):
  `fix(web): lock degommage chips during ack plus 1.2s cooldown against double taps`
  Suggested messages here:
  1. `test(web): characterize per-target tap lock expectations`
  2. `fix(web): lock only the tapped degommage chip instead of every chip`
- Do NOT push and do NOT open a PR unless the operator instructed it.

## Steps

### Step 1: Confirm the ground truth

Run the drift check from the header. Then open and read, in full:
`apps/web/src/components/live/tap-lock.ts`,
`apps/web/src/components/live/tap-lock.test.ts`,
`apps/web/src/components/live/use-tap-lock.ts`,
`apps/web/src/components/live/tap-zone.tsx`, and lines 74–160 of
`apps/web/src/components/live/live-screen.tsx`. Confirm every excerpt in
"Current state" matches (line numbers may shift by a line or two; the code must
match).

Then confirm the emit path has no global serialization:

**Verify**:
`grep -n "crypto.randomUUID" apps/web/src/hooks/use-game.ts` → prints one line
inside `sendCommand` (around line 104).
`grep -rEn "inFlight|mutex|queue|pendingCommand" apps/web/src/lib/socket.ts apps/web/src/hooks/use-game.ts`
→ **no matches**. If it matches, see STOP conditions.

Also establish the baseline is green before you change anything:

**Verify**: `pnpm --filter @degommix/web test` → exit 0.

### Step 2 (TEST-FIRST, mandatory): Rewrite the tests for the per-target lock

Replace the whole contents of `apps/web/src/components/live/tap-lock.test.ts`
with the file below. It encodes the new public API: `begin(targetId)` refuses
only that target, and `settle(targetId, ok)` now takes the target id.

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TAP_LOCK_COOLDOWN_MS, TapLock } from './tap-lock'

const IDLE = { lockedTargetIds: [], pendingTargetIds: [] }

describe('TapLock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts idle', () => {
    const lock = new TapLock()
    expect(lock.getSnapshot()).toEqual(IDLE)
  })

  it('locks only the tapped chip and swallows the bounce tap on that chip', () => {
    const lock = new TapLock()

    expect(lock.begin('u1')).toBe(true)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u1'],
      pendingTargetIds: ['u1'],
    })
    // Accidental bounce tap: same chip, same finger — swallowed.
    expect(lock.begin('u1')).toBe(false)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u1'],
      pendingTargetIds: ['u1'],
    })
  })

  it('lets another chip be tapped while the first one is on cooldown', () => {
    const lock = new TapLock()
    lock.begin('u1')
    lock.settle('u1', true)

    // Still within u1's cooldown.
    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS - 1)
    expect(lock.begin('u2')).toBe(true)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u1', 'u2'],
      pendingTargetIds: ['u2'],
    })

    // u1 releases on its own schedule, u2 keeps its full window.
    vi.advanceTimersByTime(1)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u2'],
      pendingTargetIds: ['u2'],
    })
  })

  it('holds the tapped chip for the full cooldown when the ack is fast', () => {
    const lock = new TapLock()
    lock.begin('u1')

    lock.settle('u1', true)
    expect(lock.getSnapshot().lockedTargetIds).toEqual(['u1'])

    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS - 1)
    expect(lock.getSnapshot().lockedTargetIds).toEqual(['u1'])

    vi.advanceTimersByTime(1)
    expect(lock.getSnapshot()).toEqual(IDLE)
    expect(lock.begin('u1')).toBe(true)
  })

  it('holds the tapped chip until the ack when the ack is slower than the cooldown', () => {
    const lock = new TapLock()
    lock.begin('u1')

    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS * 3)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u1'],
      pendingTargetIds: ['u1'],
    })

    lock.settle('u1', true)
    expect(lock.getSnapshot()).toEqual(IDLE)
  })

  it('releases only the rejected chip, leaving the other one locked', () => {
    const lock = new TapLock()
    lock.begin('u1')
    lock.begin('u2')

    lock.settle('u1', false)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u2'],
      pendingTargetIds: ['u2'],
    })
    // u1 is immediately tappable again, u2 is untouched.
    expect(lock.begin('u1')).toBe(true)
    expect(lock.getSnapshot().lockedTargetIds).toEqual(['u2', 'u1'])
  })

  it('keeps per-chip cooldowns independent when acks arrive out of order', () => {
    const lock = new TapLock()
    // u1 tapped at t=0 (cooldown ends at 1200), u2 at t=400 (ends at 1600).
    lock.begin('u1')
    vi.advanceTimersByTime(400)
    lock.begin('u2')

    // u2 acks first but its own cooldown is still running.
    lock.settle('u2', true)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u1', 'u2'],
      pendingTargetIds: ['u1'],
    })

    // t=1200: u1's cooldown elapsed but its ack is still pending — stays locked.
    vi.advanceTimersByTime(800)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u1', 'u2'],
      pendingTargetIds: ['u1'],
    })

    // t=1600: u2's cooldown elapses and releases u2 only.
    vi.advanceTimersByTime(400)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u1'],
      pendingTargetIds: ['u1'],
    })

    // u1's late ack releases it immediately, its cooldown having elapsed.
    lock.settle('u1', true)
    expect(lock.getSnapshot()).toEqual(IDLE)
  })

  it('still refuses a second dégommage on the same victim during the cooldown', () => {
    // Deliberate limitation: two pawns of the SAME opponent are
    // indistinguishable from a bounce tap, so the 1.2s floor stays.
    const lock = new TapLock()
    lock.begin('u1')
    lock.settle('u1', true)

    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS - 1)
    expect(lock.begin('u1')).toBe(false)

    vi.advanceTimersByTime(1)
    expect(lock.begin('u1')).toBe(true)
  })

  it('honours a custom cooldown', () => {
    const lock = new TapLock(300)
    lock.begin('u1')
    lock.settle('u1', true)

    vi.advanceTimersByTime(299)
    expect(lock.getSnapshot().lockedTargetIds).toEqual(['u1'])
    vi.advanceTimersByTime(1)
    expect(lock.getSnapshot()).toEqual(IDLE)
  })

  it('ignores an ack that arrives after that chip was released', () => {
    const lock = new TapLock()
    lock.begin('u1')
    lock.settle('u1', false)

    lock.settle('u1', true)
    expect(lock.getSnapshot()).toEqual(IDLE)
    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS * 2)
    expect(lock.getSnapshot()).toEqual(IDLE)
  })

  it('ignores an ack for a chip that was never tapped', () => {
    const lock = new TapLock()
    lock.begin('u1')

    lock.settle('u2', true)
    expect(lock.getSnapshot()).toEqual({
      lockedTargetIds: ['u1'],
      pendingTargetIds: ['u1'],
    })
  })

  it('notifies subscribers on lock, ack and release, and stops after unsubscribe', () => {
    const lock = new TapLock()
    const listener = vi.fn()
    const unsubscribe = lock.subscribe(listener)

    lock.begin('u1')
    expect(listener).toHaveBeenCalledTimes(1)

    lock.settle('u1', true)
    expect(listener).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS)
    expect(listener).toHaveBeenCalledTimes(3)

    unsubscribe()
    lock.begin('u2')
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('does not notify after dispose', () => {
    const lock = new TapLock()
    const listener = vi.fn()
    lock.subscribe(listener)

    lock.begin('u1')
    lock.begin('u2')
    lock.dispose()

    vi.advanceTimersByTime(TAP_LOCK_COOLDOWN_MS * 2)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
```

**Verify**: `pnpm --filter @degommix/web test src/components/live/tap-lock.test.ts`
→ **fails** (this is the expected red state: `settle` currently takes one
argument and the snapshot has no `lockedTargetIds`). Do not proceed until you
have seen it fail for that reason and no other.

Commit: `test(web): characterize per-target tap lock expectations`.

### Step 3: Make `TapLock` per-target

Replace the whole contents of `apps/web/src/components/live/tap-lock.ts` with:

```ts
/**
 * Anti double-tap lock for the dégommage chips (post-playtest round 1):
 * accidental bounce taps were registering two dégommages. A tap locks the
 * tapped chip until the server ack resolved AND a minimum cooldown elapsed,
 * whichever is longer — a bounce tap lands on the same chip, so it is still
 * swallowed. The other opponents' chips stay tappable: two dégommages on two
 * different victims no longer have to be entered one at a time. A rejected ack
 * releases that chip immediately so the player can retry without waiting.
 *
 * Concurrent in-flight commands are safe: every tap carries its own
 * `clientEventId` (`apps/web/src/hooks/use-game.ts`) and the ws-server
 * serializes commands per game while de-duplicating on that id
 * (`apps/ws-server/src/game-manager.ts`).
 *
 * Known limitation, on purpose: two pawns of the SAME opponent still cost one
 * cooldown each, because that is indistinguishable from a bounce tap.
 */

/** Minimum lockout after a tap — long enough to swallow a bounce tap. */
export const TAP_LOCK_COOLDOWN_MS = 1200

export interface TapLockSnapshot {
  /** Targets whose chip is locked: ack pending, cooldown running, or both. */
  readonly lockedTargetIds: readonly string[]
  /** Targets whose dégommage is still awaiting its server ack. */
  readonly pendingTargetIds: readonly string[]
}

type Listener = () => void

const IDLE: TapLockSnapshot = { lockedTargetIds: [], pendingTargetIds: [] }

interface LockEntry {
  timer: ReturnType<typeof setTimeout> | null
  ackSettled: boolean
}

/** Framework-agnostic store behind `useTapLock` — see the module doc. */
export class TapLock {
  private readonly cooldownMs: number
  private readonly listeners = new Set<Listener>()
  private readonly entries = new Map<string, LockEntry>()
  private snapshot: TapLockSnapshot = IDLE

  constructor(cooldownMs: number = TAP_LOCK_COOLDOWN_MS) {
    this.cooldownMs = cooldownMs
  }

  readonly getSnapshot = (): TapLockSnapshot => this.snapshot

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Registers a tap on `targetId`. Returns `false` when that chip is already
   * locked — the caller must then swallow the event instead of sending a second
   * command for the same victim.
   */
  readonly begin = (targetId: string): boolean => {
    if (this.entries.has(targetId)) return false
    const entry: LockEntry = { timer: null, ackSettled: false }
    entry.timer = setTimeout(() => {
      this.onCooldownElapsed(targetId)
    }, this.cooldownMs)
    this.entries.set(targetId, entry)
    this.publish()
    return true
  }

  /**
   * Resolves the pending tap on `targetId` with the server ack: `ok: false`
   * unlocks that chip right away, `ok: true` waits for its remaining cooldown.
   * An ack for an already-released (or never-locked) chip is ignored.
   */
  readonly settle = (targetId: string, ok: boolean): void => {
    const entry = this.entries.get(targetId)
    if (!entry) return
    entry.ackSettled = true
    if (ok && entry.timer !== null) {
      this.publish()
      return
    }
    this.release(targetId)
  }

  /** Drops every pending timer and the subscribers — call on unmount. */
  readonly dispose = (): void => {
    for (const entry of this.entries.values()) {
      if (entry.timer !== null) clearTimeout(entry.timer)
    }
    this.entries.clear()
    this.snapshot = IDLE
    this.listeners.clear()
  }

  private onCooldownElapsed(targetId: string): void {
    const entry = this.entries.get(targetId)
    if (!entry) return
    entry.timer = null
    if (entry.ackSettled) this.release(targetId)
  }

  private release(targetId: string): void {
    const entry = this.entries.get(targetId)
    if (!entry) return
    if (entry.timer !== null) clearTimeout(entry.timer)
    this.entries.delete(targetId)
    this.publish()
  }

  private publish(): void {
    const lockedTargetIds: string[] = []
    const pendingTargetIds: string[] = []
    for (const [targetId, entry] of this.entries) {
      lockedTargetIds.push(targetId)
      if (!entry.ackSettled) pendingTargetIds.push(targetId)
    }
    this.snapshot = { lockedTargetIds, pendingTargetIds }
    for (const listener of this.listeners) listener()
  }
}
```

Notes so you do not "fix" things that are intentional:

- `publish()` rebuilds the snapshot object once per state change, so
  `getSnapshot()` stays referentially stable between changes — that is what
  `useSyncExternalStore` requires.
- Insertion order of the `Map` is what makes the arrays deterministic in the
  tests. Do not sort.
- `settle(..., true)` now publishes (the chip moves from pending to
  cooldown-only), which is why the subscriber test expects 3 notifications.

**Verify**: `pnpm --filter @degommix/web test src/components/live/tap-lock.test.ts`
→ exit 0, all tests pass (13 tests).

### Step 4: Update the React binding

In `apps/web/src/components/live/use-tap-lock.ts`, change only the settle
signature and the destructured fields:

```ts
export interface UseTapLockResult extends TapLockSnapshot {
  /** Registers a tap — `false` means it was swallowed as a double tap. */
  begin: (targetId: string) => boolean
  /** Resolves the pending tap on that target with the server ack result. */
  settle: (targetId: string, ok: boolean) => void
}
```

and

```ts
  const { lockedTargetIds, pendingTargetIds } = useSyncExternalStore(
    lock.subscribe,
    lock.getSnapshot,
    lock.getSnapshot
  )

  return { lockedTargetIds, pendingTargetIds, begin: lock.begin, settle: lock.settle }
```

Leave the `useMemo`/`useEffect`/`dispose` wiring untouched.

**Verify**: `pnpm --filter @degommix/web exec tsc --noEmit` → will still report
errors in `tap-zone.tsx` / `live-screen.tsx` only (they are fixed in steps 5–6).
Confirm no error points at `use-tap-lock.ts`.

### Step 5: Disable and dim only the locked chip in `TapZone`

In `apps/web/src/components/live/tap-zone.tsx`:

1. Replace the two lock props with the arrays:

```tsx
  /** Targets whose chip is locked by the anti double-tap lock (`tap-lock.ts`). */
  lockedTargetIds: readonly string[]
  /** Targets whose degommage is still awaiting the server ack. */
  pendingTargetIds: readonly string[]
```

2. Update the signature:
   `export function TapZone({ opponents, names, onTap, lockedTargetIds, pendingTargetIds }: TapZoneProps) {`

3. Update the component doc's last sentence to describe the new behaviour, in
   English, e.g.: "Only the tapped chip locks for the duration of a tap so a
   bounce tap cannot register a second degommage on the same victim; the other
   opponents stay tappable." Keep the French copy « Tu viens de dégommer qui ? »
   on line 34 byte-identical.

4. Inside the `map`, derive per-chip state and drop the global dimming:

```tsx
          const meta = CHARACTER_META[opponent.character]
          const isLocked = lockedTargetIds.includes(opponent.userId)
          const isPending = pendingTargetIds.includes(opponent.userId)
          return (
            <button
              key={opponent.userId}
              type="button"
              disabled={isLocked}
              aria-busy={isPending}
              data-state={isPending ? 'confirming' : isLocked ? 'locked' : 'idle'}
              onClick={() => {
                onTap(opponent.userId)
              }}
              className={[
                CHIP_BASE,
                isLocked
                  ? 'cursor-default'
                  : 'cursor-pointer active:scale-90 motion-reduce:active:scale-100',
                isLocked ? 'scale-95 opacity-80 motion-reduce:scale-100' : '',
              ]
                .filter(Boolean)
                .join(' ')}
```

The `opacity-40` class is removed entirely: it existed only to dim the chips
that were collateral damage of the global lock. The tapped chip keeps the
existing "confirming" look for its whole lock window. Do not touch `CHIP_BASE`,
the inline `style`, `CharacterBadge`, `displayName`, or the `+1` span.

**Verify**: `grep -n "opacity-40" apps/web/src/components/live/tap-zone.tsx` →
no matches.

### Step 6: Pass the target id when settling in `LiveScreen`

In `apps/web/src/components/live/live-screen.tsx`:

```tsx
  /** Anti double-tap: a tap locks that chip until its ack and cooldown. */
  const handleTap = async (targetId: string): Promise<void> => {
    if (!tapLock.begin(targetId)) return
    const ack = await game.degommage(targetId)
    tapLock.settle(targetId, ack.ok)
    if (!ack.ok) toast(ackErrorMessage(ack), 'error')
  }
```

and at the render site:

```tsx
        <TapZone
          opponents={opponents}
          names={names}
          lockedTargetIds={tapLock.lockedTargetIds}
          pendingTargetIds={tapLock.pendingTargetIds}
          onTap={(targetId) => {
            void handleTap(targetId)
          }}
        />
```

Change nothing else in this file.

**Verify**: `pnpm typecheck` → exit 0. `pnpm lint` → exit 0.

### Step 7: Full verification

Run, from the repo root:

1. `pnpm --filter @degommix/web test` → exit 0.
2. `pnpm typecheck` → exit 0.
3. `pnpm lint` → exit 0.
4. `docker compose -f docker-compose.test.yml up -d` then
   `pnpm exec turbo run test --concurrency=1` → exit 0. (If Docker is
   unavailable in your environment, say so explicitly in your report instead of
   claiming the suite passed.)
5. `git status --porcelain` → only the in-scope files listed in "Scope".

**Verify**: paste the actual tail of each command's output in your report. Do
not assert success without output.

Commit: `fix(web): lock only the tapped degommage chip instead of every chip`.

### Step 8: Hand back for real-table validation

Update this plan's row in `plans/README.md` to
`IN PROGRESS — awaiting real-table validation` and report to the operator with:

- the command outputs from step 7,
- the exact manual protocol from "Done criteria" below,
- one sentence stating that same-victim double dégommages still wait out the
  1.2 s cooldown by design.

Only the operator flips the row to `DONE`, after a physical game.

## Test plan

All new tests live in the existing `apps/web/src/components/live/tap-lock.test.ts`
(pure unit tests, node environment, fake timers — structural pattern: the
current version of that same file, and `apps/web/src/components/live/finish-guard.test.ts`
for another example of a pure guard test in this folder). Cases covered, mapped
to the mandate:

- (a) same-chip bounce within the cooldown → swallowed:
  "locks only the tapped chip and swallows the bounce tap on that chip" and
  "still refuses a second dégommage on the same victim during the cooldown".
- (b) different-chip tap during another chip's cooldown → allowed:
  "lets another chip be tapped while the first one is on cooldown".
- (c) rejected ack releases only that chip:
  "releases only the rejected chip, leaving the other one locked".
- (d) ack-then-cooldown ordering both ways:
  "holds the tapped chip for the full cooldown when the ack is fast" (ack first),
  "holds the tapped chip until the ack when the ack is slower than the cooldown"
  (cooldown first), and "keeps per-chip cooldowns independent when acks arrive
  out of order" (two chips interleaved).
- Regression guards kept from the old suite: idle snapshot, custom cooldown,
  late ack ignored, subscribe/unsubscribe, dispose.
- New guard: "ignores an ack for a chip that was never tapped".

No React component test is added (no `@testing-library/react` in this repo —
see "Repo conventions"). The rendering change is covered by `pnpm typecheck`
plus the e2e happy path.

Verification: `pnpm --filter @degommix/web test src/components/live/tap-lock.test.ts`
→ exit 0, 13 tests pass.

## Done criteria

Machine-checkable unless marked MANUAL. ALL must hold:

- [ ] `pnpm --filter @degommix/web test src/components/live/tap-lock.test.ts` exits 0 with 13 passing tests
- [ ] `pnpm --filter @degommix/web test` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm exec turbo run test --concurrency=1` exits 0 with the test DB up (or the report states Docker was unavailable)
- [ ] `grep -rEn "pendingTargetId\b" apps/web/src` returns no matches (the old singular field is gone)
- [ ] `grep -rn "settle(ack.ok)" apps/web/src` returns no matches
- [ ] `grep -n "opacity-40" apps/web/src/components/live/tap-zone.tsx` returns no matches
- [ ] `grep -n "TAP_LOCK_COOLDOWN_MS = 1200" apps/web/src/components/live/tap-lock.ts` still matches (the value was not tuned)
- [ ] `git diff --name-only 094ddfd..HEAD` lists only files from the "In scope" list
- [ ] `git status --porcelain` shows no modification outside the in-scope list
- [ ] `plans/README.md` status row updated
- [ ] **MANUAL (operator, on a real table — mandatory before this is DONE)**: the
      previous version of this lock came out of a physical playtest, so a green
      test suite is not sufficient evidence. Play at least one real 3- or
      4-player game on the board with the app and confirm, in this order:
      (1) a deliberate bounce tap on the same portrait still produces exactly
      one dégommage (check the counter and the journal);
      (2) two dégommages on two different opponents can be entered back to back
      with no wait, and both counters are right on every phone;
      (3) with the phone in airplane mode for one tap, the toast
      « Action non transmise — vérifie ta connexion » appears and that chip
      alone becomes tappable again, the others were never blocked;
      (4) « Annuler la dernière action » still removes exactly one dégommage.

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" does not match the excerpts —
  the codebase drifted since this plan was written (commit `094ddfd`).
- The grep in step 1 shows the emit path serializes commands globally (a shared
  in-flight slot, mutex, or command queue in `apps/web/src/lib/socket.ts` or
  `apps/web/src/hooks/use-game.ts`). Per-target locking is pointless — and
  possibly wrong — if only one command can be in flight at a time.
  **Do NOT restructure the socket layer to make this plan work**; stop and
  report what you found.
- Making the tests pass appears to require touching `apps/ws-server/**`,
  `packages/game-core/**`, or any file outside the "In scope" list.
- You conclude the fix needs `TAP_LOCK_COOLDOWN_MS` changed, or a new UI
  affordance (quantity picker, `+2`, long press, confirmation) — those are
  explicitly out of scope; report the reasoning instead.
- `e2e/happy-path.spec.ts` fails, or you feel the need to edit it. Its two
  consecutive taps on the same chip are exactly the behaviour this plan must
  preserve.
- Any step's verification fails twice after a reasonable fix attempt.
- The assumption "each tap carries its own `clientEventId`, so several in-flight
  dégommages to different targets cannot double-count" turns out to be false.

## Maintenance notes

For whoever owns this code next:

- **What a reviewer should scrutinize**: that `begin()` keys on `targetId` and
  nothing else; that `dispose()` clears every per-target timer (a leaked timer
  per chip is the new failure mode a global single timer could not have); and
  that the bounce-tap test still asserts a *refusal*, not just a snapshot shape.
- **Deliberate residual cost**: a legit double dégommage on the same victim
  still waits ~1.2 s. Alternatives considered and NOT implemented here, in
  rough order of appeal if the next playtest says the same-victim case still
  hurts:
  1. Shorten the cooldown only for a *second* tap that follows a *confirmed*
     ack on the same target (e.g. 300–400 ms), keeping 1.2 s for the
     unconfirmed case. Cheap, but re-tunes a playtest-derived number — needs
     its own table validation.
  2. Distinguish a bounce from an intent with input data rather than time
     (`PointerEvent` timing/pressure, or requiring the finger to leave the chip
     between taps). More faithful, more platform risk.
  3. Batch taps on the same target inside the cooldown into a single command
     with a count. Rejected for now: `SPECS.md:105` fixes the model at « un tap
     par pion dégommé » and `packages/game-core` maps one `DEGOMMAGE` event to
     exactly one pawn (`docs/superpowers/specs/2026-07-25-degommix-design.md:167`),
     so this would ripple into the event schema, the journal and undo.
- **Future interactions**: if a client-side command queue or an offline outbox
  is ever added (both are explicitly out of V1 — the design doc rules out an
  offline mode), the per-target lock must be re-examined: it assumes a tap's
  ack resolves the same tap. Likewise, if the chip row ever gains a
  non-opponent action, `lockedTargetIds` must not be reused as a generic "row
  is busy" flag.
- **Do not merge this with a cooldown re-tune in the same PR.** Scope change and
  value change must be separately validated at a real table, otherwise a
  regression cannot be attributed.
