# Plan 029: Balance une vanne — long-press an opponent card to slam a taunt stamp on every phone of the table

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 08f1da1..HEAD -- apps/web/src/components/live/opponent-card.tsx apps/web/src/components/live/live-screen.tsx apps/web/src/components/dev/long-press.ts apps/web/src/components/dev/use-long-press.ts apps/web/src/lib/realtime-types.ts apps/web/src/app/globals.css apps/ws-server/src/handlers/game.ts apps/ws-server/src/rate-limit.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (the gesture is added to the most-tapped surface of the app — a
  long press that leaks into the tap handler would send a phantom dégommage)
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `08f1da1`, 2026-07-26

## Decision points — resolved by the owner, do NOT revisit

1. **Taunts are EPHEMERAL and DECORATIVE.** `game:taunt` is a socket relay and
   nothing else: it is **never** appended to `game_events`, never fed to the
   `@degommix/game-core` reducer, never shown in the live journal, the summary,
   the game-detail journal or any archive. A taunt leaves no trace once the
   1.6 s stamp fades. If your implementation seems to need a reducer change, a
   new `GameEvent` type, a DB migration or a `gameEvents` insert — **STOP**
   (see "STOP conditions"). `packages/game-core/**` and `packages/db/**` are
   not modified by this plan at all.
2. **The owner-validated taunt list is exactly these 8 lines, verbatim.**
   Do not add, remove, reword or reorder them:
   1. « Ils sont fous ces Romains ! »
   2. « Tu trembles, Romain ? »
   3. « C’est tout ce que Rome envoie ? »
   4. « Mon menhir court plus vite que tes pions »
   5. « Reviens quand tu auras bu la potion »
   6. « Même Idéfix joue mieux »
   7. « L’écurie t’attend, plein sabot »
   8. « Par Toutatis, quel carnage annoncé »
   Apostrophes are the typographic ’ (U+2019), matching the repo's French copy
   (`end-request-sheet.tsx` « J’abandonne », `ws-errors.ts` « n’existe plus »).
   Identifiers stay English (`crazy_romans`, `by_toutatis`, …).
3. **The cooldown is keyed by USER, not by socket** —
   `` limiter.assert(`${userId}:game:taunt`, 1, 60_000) `` — which deviates from
   the two existing limiter keys (both `` `${socket.id}:…` ``, see "Current
   state"). Reason: the existing keys guard against flooding, where per-socket
   is the right grain; this one is a **game rule** (« une vanne par minute »),
   and a socket-keyed 60 s window would be defeated by opening a second tab.
   Keep the per-user key.
4. **The client refuses to open the picker while its own cooldown runs**, and
   toasts the remaining seconds instead. There is no ticking countdown UI and
   no disabled picker state — the picker either opens or does not. The server
   stays the authority: a taunt that slips through anyway (second tab, clock
   skew) comes back as a `RATE_LIMITED` ack, which the live screen toasts
   through the existing `ackErrorMessage` mapping (« Doucement ! Réessaie dans
   un instant »).
5. **The sender sees their own taunt.** The relay is
   `` io.to(`game:${gameId}`).emit(…) `` — a room emit, which includes the
   sender's own sockets (unlike `socket.broadcast.to(…)`). No client-side
   optimistic rendering: everyone, sender included, paints the stamp from the
   same broadcast, so the whole table sees it at the same moment.
6. **Two id lists on purpose, no shared package.** The ws-server holds an
   ids-only whitelist (`apps/ws-server/src/taunts.ts`), the web app holds the
   ids + French copy (`apps/web/src/components/live/taunts.ts`). No French text
   ever crosses the wire — only a whitelisted id — so a hostile client cannot
   push arbitrary text onto other players' phones. The duplication is the price
   of keeping `packages/game-core` untouched (Decision 1); a done-criteria
   `diff` command checks the two lists stay identical, and the client ignores
   any id it does not know (forward compatibility with a newer server).
7. **Event names are asymmetric**: client → server is `game:send_taunt`
   (ack'd command), server → client is `game:taunt` (broadcast). Same
   asymmetry as `lobby:create` → `lobby:state`. Do not name both sides
   `game:taunt`.

## Why this matters

Dégommix is played around a real table: 2 to 4 phones, everybody shouting.
The app currently carries only mechanical signal — a tap, a counter, a shake.
Plan 011 proved how much of the fun lives in the BD stamp that slams on the
struck card; the round-2 and round-3 playtests confirmed the table wants to *talk*. Taunts
give the trash-talk a place inside the app without inventing a chat: a long
press on the opponent you want to needle, one of eight Astérix-flavoured lines,
and the whole table's phones get slammed with a rotated stamp at once. Because
they are pure decoration — no event log, no stats, no history — they cost the
game model nothing and can never corrupt a score. The risk is entirely in the
gesture: the opponent card *is* the dégommage button since the « Tape le portrait » redesign (commit e479221), so
the long press has to coexist with the most-tapped surface of the app without
ever leaking a phantom tap.

## Current state

All excerpts verified at commit `08f1da1`.

### Files and their roles

- `apps/web/src/components/live/opponent-card.tsx` — « Tape le portrait »
  card; the whole card is one `<button>` whose `onClick` sends the dégommage.
  This is where the long press is added.
- `apps/web/src/components/live/live-screen.tsx` — live board; owns the tap
  lock, the toaster and the overlays (sheet, modal). Wires the picker + stamp.
- `apps/web/src/components/live/tap-lock.ts` / `use-tap-lock.ts` — the
  per-target tap lock of plan 007 (read-only context, NOT modified).
- `apps/web/src/components/dev/long-press.ts` / `use-long-press.ts` — an
  existing, unit-tested, framework-agnostic long-press recognizer (built for
  plan 014's hidden dev menu). **Reused as-is**, not copied, not moved.
- `apps/web/src/components/live/overlay.tsx` — `Sheet` / `Modal` primitives.
- `apps/web/src/components/live/hit-burst.tsx` + `globals.css:1114-1225` — the
  plan 011 stamp aesthetic the taunt stamp reuses.
- `apps/web/src/lib/realtime-types.ts` — the socket contract (both directions).
- `apps/web/src/lib/socket.ts` — `emitWithAck`.
- `apps/web/src/lib/ws-errors.ts` — `ackErrorMessage`, already maps
  `RATE_LIMITED` → « Doucement ! Réessaie dans un instant ».
- `apps/ws-server/src/handlers/game.ts` — where the new handler goes.
- `apps/ws-server/src/rate-limit.ts` — the sliding-window limiter.
- `apps/ws-server/src/ack.ts` — `withAck`, `CommandError`, `OK`.
- `apps/ws-server/src/lobby-shared.ts` — `getSeat`, `getGameOrThrow`.
- `apps/ws-server/test/harness.ts` / `flows.ts` — integration test helpers.

### The opponent card is one big button — the tap is `onClick`

`apps/web/src/components/live/opponent-card.tsx:69-85`:

```tsx
    <div
      className="player-card opp-slot"
      data-testid={`player-card-${username}`}
      data-hit={phase}
      style={{ '--camp': meta.colorVar } as CSSProperties}
    >
      <button
        type="button"
        className="opp-card"
        disabled={out || !canAct || isLocked}
        aria-busy={isPending}
        data-state={state}
        onClick={() => {
          onTap(player.userId)
        }}
      >
```

Its doc comment (`opponent-card.tsx:39-51`) states the invariant to preserve:
« The whole card is the button … A tap presses the key and starts the 1.2 s
lock ». Note `disabled={out || !canAct || isLocked}`: **a disabled button emits
no pointer events**, so while the 1.2 s tap lock runs, or for a player who left,
or for a viewer who cannot act, the long press is unavailable too. That is
accepted behaviour — do not try to work around it by moving the gesture onto
the `.opp-slot` wrapper.

### The per-target tap lock (plan 007) that the gesture must not disturb

`apps/web/src/components/live/live-screen.tsx:103-109`:

```tsx
  /** Anti double-tap: a tap locks that chip until its ack and cooldown. */
  const handleTap = async (targetId: string): Promise<void> => {
    if (!tapLock.begin(targetId)) return
    const ack = await game.degommage(targetId)
    tapLock.settle(targetId, ack.ok)
    if (!ack.ok) toast(ackErrorMessage(ack), 'error')
  }
```

`tap-lock.ts:1-20` documents why it exists: « accidental bounce taps were
registering two dégommages. A tap locks the tapped chip until the server ack
resolved AND a minimum cooldown elapsed » — `TAP_LOCK_COOLDOWN_MS = 1200`.
A long press must therefore **never** reach `handleTap`: it would both send a
dégommage and burn the 1.2 s lock on that target.

### The long-press recognizer that already exists (reuse it)

`apps/web/src/components/dev/long-press.ts:1-20`:

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
```

`apps/web/src/components/dev/use-long-press.ts:17-56` — the React binding.
It accepts a custom hold: `useLongPress(onFire, holdMs = LONG_PRESS_MS)`, keeps
`onFire` in a ref (« so a re-render never rebuilds the recognizer mid-hold »),
cancels on window scroll (capture phase), and returns exactly these handlers:

```ts
export interface LongPressHandlers {
  onPointerDown: (event: ReactPointerEvent) => void
  onPointerMove: (event: ReactPointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onPointerLeave: () => void
  onContextMenu: (event: ReactMouseEvent) => void
}
```

`onPointerDown` ignores non-primary buttons (`if (event.button !== 0) return`)
and `onContextMenu` calls `preventDefault()` (« Otherwise Android and desktop
pop their context menu mid-hold »). `LongPress.start` fires the callback **while
the finger is still down**, then clears itself (`long-press.ts:44-53`) — which
is exactly why the subsequent `click` must be suppressed (step 5).

Its CSS companion, `globals.css:1571-1576`:

```css
.dev-longpress {
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
  touch-action: manipulation;
}
```

`.opp-card` already has `user-select: none` and
`-webkit-tap-highlight-color: transparent` (`globals.css:696-698`) but **not**
`-webkit-touch-callout` nor `touch-action` — step 6 adds them.

### The plan 011 stamp aesthetic to reuse

`globals.css:1114-1136` (`.hit-stamp`) is the look: Cinzel display font,
uppercase, `--asterix` fill, and a comic-book outline made of hard offsets:

```css
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
```

and its slam, `globals.css:1168-1174`:

```css
@keyframes hit-stamp-a {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(2.7) rotate(-24deg); }
  24% { opacity: 1; transform: translate(-50%, -50%) scale(0.9) rotate(-9deg); }
  36% { opacity: 1; transform: translate(-50%, -50%) scale(1.07) rotate(-11.5deg); }
  58% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(-10deg); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.14) rotate(-10deg); }
}
```

`globals.css:1072-1084` explains the a/b duplication trick (« Changing
`animation-name` is what restarts a CSS animation … The duplication buys a
restart with no React remount — the card holds a `next/image` portrait we do
not want to tear down 20 times a game »). **The taunt stamp does NOT need that
trick**: it is a standalone overlay with no image, so a React `key` bump
remounts it and restarts the animation. Use the `key`; do not duplicate
keyframes.

Reduced-motion convention — the app disables motion **twice**, once for the OS
setting and once for the dev playground toggle. `globals.css:1219-1225`:

```css
/* Reduced motion: no shake, no stars, no stamp — the counter just breathes. */
@media (prefers-reduced-motion: reduce) {
  .player-card[data-hit] { animation: none; }
  .hit-fx { display: none; }
  .player-card[data-hit='a'] .hit-tally { animation: hit-tally-fade-a 420ms ease both; }
  .player-card[data-hit='b'] .hit-tally { animation: hit-tally-fade-b 420ms ease both; }
}
```

and `globals.css:1613-1616`:

```css
[data-motion='reduced'] .player-card[data-hit] { animation: none; }
[data-motion='reduced'] .hit-fx { display: none; }
```

Any new animation must be neutralised in **both** places.

### Server: how a handler, its ack and its rate limit are written

`apps/ws-server/src/handlers/game.ts:61-86`:

```ts
export function registerGameHandlers(socket: AppSocket, ctx: AppContext): void {
  const { db, io, manager, limiter } = ctx
  const userId = socket.data.userId

  socket.on(
    'game:command',
    withAck(gameCommandSchema, async ({ gameId, clientEventId, command }) => {
      limiter.assert(
        `${socket.id}:game:command`,
        GAME_COMMAND_RATE_LIMIT,
        GAME_COMMAND_RATE_WINDOW_MS
      )
      return manager.submitCommand(gameId, userId, clientEventId, command)
    })
  )

  socket.on(
    'game:resync',
    withAck(resyncSchema, async ({ gameId, lastSeq }) => {
      const seat = await getSeat(db, gameId, userId)
      if (!seat) throw new CommandError('NOT_MEMBER')
      await socket.join(`game:${gameId}`)
      const events = await manager.getEventsSince(gameId, lastSeq)
      return { ok: true, events, serverNow: Date.now() }
    })
  )
```

Note the two existing constants (`game.ts:32-33`):

```ts
const GAME_COMMAND_RATE_LIMIT = 20
const GAME_COMMAND_RATE_WINDOW_MS = 1_000
```

and the only other limiter site in the whole server,
`apps/ws-server/src/handlers/friends.ts:13-14,28`:

```ts
const FRIENDS_RATE_LIMIT = 10
const FRIENDS_RATE_WINDOW_MS = 60_000
…
      limiter.assert(`${socket.id}:friends:request`, FRIENDS_RATE_LIMIT, FRIENDS_RATE_WINDOW_MS)
```

The mechanism, `apps/ws-server/src/rate-limit.ts:3-25` — an **in-memory**
sliding window (single ws-server instance on Railway; the counters reset on
deploy, which is acceptable for a cosmetic cooldown):

```ts
/** In-memory sliding-window rate limiter, keyed by caller-provided strings. */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>()
  constructor(private readonly now: () => number = Date.now) {}

  consume(key: string, limit: number, windowMs: number): boolean { … }

  /** Throws `RATE_LIMITED` when the window is exhausted. */
  assert(key: string, limit: number, windowMs: number): void {
    if (!this.consume(key, limit, windowMs)) throw new CommandError('RATE_LIMITED')
  }
}
```

`withAck` (`apps/ws-server/src/ack.ts:32-63`) Zod-parses the payload, answers
`{ ok: false, code: 'INTERNAL', message: 'invalid payload' }` on a parse
failure, and maps a thrown `CommandError` onto `{ ok: false, code }`.
`OK` is the shared `{ ok: true }` constant (`ack.ts:17`).

Seat + game helpers, `apps/ws-server/src/lobby-shared.ts:120-152`:

```ts
export async function getGameOrThrow(db: Db, gameId: string): Promise<GameRow> {
  const [game] = await db.select().from(games).where(eq(games.id, gameId))
  if (!game) throw new CommandError('NOT_FOUND')
  return game
}
…
export async function getSeat(db: Db, gameId: string, userId: string): Promise<GamePlayerRow | undefined>
```

Room membership: every seated player's socket joins `game:{gameId}` at
handshake (`server.ts:201`) and on `game:resync` (`game.ts:82`). The game
manager broadcasts with `` this.deps.io.to(`game:${gameId}`).emit('game:event', event) ``
(`game-manager.ts:190`) — the same room emit this plan reuses.

### The socket contract, both directions

`apps/web/src/lib/realtime-types.ts:86-98`:

```ts
/** Broadcasts pushed by the ws-server (rooms `user:{id}` / `game:{id}`). */
export interface ServerToClientEvents {
  'game:event': (event: GameEvent) => void
  'game:state_snapshot': (payload: GameStateSnapshotPayload) => void
  'game:host_changed': (payload: HostChangedPayload) => void
  'game:kicked': (payload: KickedPayload) => void
  'lobby:state': (state: LobbyState) => void
  'invite:received': (payload: InviteReceivedPayload) => void
  'invite:canceled': (payload: InviteCanceledPayload) => void
  'friends:event': (payload: FriendsEventPayload) => void
  'presence:update': (payload: PresenceUpdatePayload) => void
  'stats:invalidate': (payload: StatsInvalidatePayload) => void
}
```

and `realtime-types.ts:100-101,158-169` for the command side:

```ts
/** Client → server commands: event name → payload and ack result shapes. */
export interface CommandMap {
  …
  'game:command': {
    payload: { gameId: string; clientEventId: string; command: Command }
    result: { seq: number }
  }
  'game:resync': {
    payload: { gameId: string; lastSeq: number }
    result: { events: GameEvent[]; serverNow: number }
  }
```

`emitWithAck` (`apps/web/src/lib/socket.ts:80-101`) is the generic ack helper —
`emitWithAck(socket, 'game:send_taunt', payload)` resolves with the ack, or with
a synthetic `{ ok: false, code: 'INTERNAL', message: 'ack timeout' }` after 10 s.
Use it directly; `sendGameCommand`'s retry policy is for idempotent, persisted
commands only and must NOT be used for taunts (a retried taunt would slam the
table twice).

`useGame` (`apps/web/src/hooks/use-game.ts:73-78`) shows the per-game guard the
taunt hook mirrors:

```ts
    const onSnapshot = (payload: GameStateSnapshotPayload): void => {
      if (payload.gameId !== gameId) return
```

### Overlay primitives to reuse for the picker

`apps/web/src/components/live/overlay.tsx:12-40` — `Sheet` is a bottom sheet
over a dim backdrop with a « Fermer » backdrop button, `role="dialog"`,
`aria-modal`. Row-button styling to copy, `end-request-sheet.tsx:96-104`:

```tsx
            <button
              key={player.userId}
              type="button"
              onClick={() => setStep({ kind: 'confirm', end: 'village', winnerId: player.userId })}
              className="flex cursor-pointer items-center gap-2 rounded-xl border-2 p-2 text-sm font-bold"
              style={{
                borderColor: 'var(--parchment-line)',
                background: 'var(--surface)',
                color: 'var(--ink)',
              }}
            >
```

The toaster is reached with `const { toast } = useToast()` — already imported
and used in `live-screen.tsx:53,100,108`. `toast` is a stable `useCallback`.

### Other conventions

- French UI text, English identifiers/comments, TS strict, no `any`,
  named exports, kebab-case filenames.
- Web unit tests are vitest in the **`node` environment with no DOM**
  (`apps/web/vitest.config.ts`: `environment: 'node'`,
  `include: ['src/**/*.test.ts']`). There is no jsdom and no
  @testing-library: **components are never unit-tested**, only pure `.ts`
  modules are (`tap-lock.test.ts`, `long-press.test.ts`, `hit-fx.test.ts` are
  the exemplars). Put every testable rule in a pure module.
- ws-server tests are integration tests against a real Postgres
  (`apps/ws-server/vitest.config.ts`: `fileParallelism: false` — « Integration
  suites share the test database: run files one at a time »).
- **Web unit baseline at `08f1da1`: 31 test files / 382 tests.** (Verified by
  counting `it(` blocks across `apps/web/src/**/*.test.ts` at that commit: 362
  literal blocks, of which `ws-errors.test.ts:7` is an
  `it.each(ERROR_CODES)` expanding to the 21 codes of
  `packages/game-core/src/protocol.ts:1-22` → 362 − 1 + 21 = 382. The last
  published figures were 331 at `596863e`; rounds 4-5 landed the difference.)

## Commands you will need

All from the repo root, verified against `08f1da1`'s `package.json`:

| Purpose            | Command                                             | Expected on success                  |
|--------------------|-----------------------------------------------------|--------------------------------------|
| Install            | `pnpm install`                                      | exit 0                               |
| Lint (all)         | `pnpm lint`                                         | exit 0                               |
| Typecheck (all)    | `pnpm typecheck`                                    | exit 0                               |
| Web unit tests     | `pnpm --filter @degommix/web test`                  | 382 tests (baseline) → 392 after     |
| Test DB up         | `docker compose -f docker-compose.test.yml up -d`   | container healthy                    |
| All tests (serial) | `pnpm exec turbo run test --concurrency=1`          | all pass                             |
| ws-server only     | `pnpm --filter @degommix/ws-server test`            | all pass (needs the test DB up)      |
| E2E                | `pnpm test:e2e`                                     | happy-path passes, unmodified        |

The ws-server suites need the docker-compose Postgres running first, and the
turbo run must be serialized with `--concurrency=1`. If docker is unavailable
in your environment, run lint + typecheck + the web-filtered unit tests, say so
explicitly in your report, and do NOT claim the ws-server tests pass.

## Suggested executor toolkit

- Invoke `superpowers:test-driven-development` for step 2 (`taunts.ts` +
  its tests) and step 9 (the ws-server integration suite): both are pure
  rule-shaped code where writing the test first pays.
- Invoke `superpowers:verification-before-completion` before reporting done —
  every claim in "Done criteria" must be backed by real command output.
- Read `plans/011-degommage-hit-animation.md` if you want more background on
  the stamp aesthetic (not required — everything needed is inlined above).

## Scope

**In scope** (the only files you may modify or create):

Server:
- `apps/ws-server/src/taunts.ts` (create — id whitelist only)
- `apps/ws-server/src/handlers/game.ts` (modify — one new handler)
- `apps/ws-server/test/taunts.test.ts` (create)

Web:
- `apps/web/src/components/live/taunts.ts` (create — pure module: ids, French
  copy, cooldown maths)
- `apps/web/src/components/live/taunts.test.ts` (create)
- `apps/web/src/components/live/use-taunts.ts` (create — socket hook)
- `apps/web/src/components/live/taunt-picker.tsx` (create)
- `apps/web/src/components/live/taunt-stamp.tsx` (create)
- `apps/web/src/components/live/opponent-card.tsx` (modify — gesture)
- `apps/web/src/components/live/live-screen.tsx` (modify — wiring)
- `apps/web/src/lib/realtime-types.ts` (modify — two contract entries)
- `apps/web/src/app/globals.css` (modify — stamp CSS + 2 properties on
  `.opp-card`)

**Out of scope** (do NOT touch, even though they look related):

- `packages/game-core/**` — taunts never reach the reducer, the event log or
  the protocol package (Decision 1). If you think you need a new `GameEvent`,
  a `Command` variant or a new `ErrorCode`, STOP.
- `packages/db/**` and `apps/*/drizzle/**` — no table, no column, no
  migration. Taunts are not persisted anywhere.
- `apps/ws-server/src/game-manager.ts` — the taunt relay never goes through
  the command pipeline (no `seq`, no `gameEvents` insert, no idempotency key).
- `apps/ws-server/src/rate-limit.ts` — reuse `RateLimiter` as-is; do not add
  a per-key clock injection seam (see step 9 for how the tests avoid needing
  one).
- `apps/web/src/components/dev/long-press.ts` / `use-long-press.ts` — reused
  unchanged, including their doc comments. Do NOT move them to `lib/`
  (deferred, see "Maintenance notes"); do NOT copy them either.
- `apps/web/src/components/live/tap-lock.ts` / `use-tap-lock.ts` — plan 007's
  lock is untouched; the gesture works around it, not through it.
- `apps/web/src/components/live/live-journal.ts(x)`, `summary.tsx`,
  `use-live-journal.ts`, `apps/web/src/lib/queries/game-detail-journal.ts` —
  a taunt is never journaled (Decision 1).
- `apps/web/src/app/dev/animations/**` — a playground demo for the taunt
  stamp is explicitly deferred.
- `e2e/**` — the specs must pass unchanged.
- `plans/README.md` content beyond your own status row.

## Git workflow

- Branch: `git checkout -b feat/029-live-taunts` (repo convention
  `type/short-description`).
- Conventional commits. This change spans web + ws-server, so use the `app`
  scope — exemplar from `git log`:
  `fix(app): playtest round 2 — ghost invites, friend invite, leaderboard cache & podium, last seen, rematch consent`.
  Suggested message: `feat(app): balance une vanne — live taunts stamped on every phone`.
- Commit per step or per logical unit.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Server-side taunt id whitelist

Create `apps/ws-server/src/taunts.ts`:

```ts
/**
 * Whitelist of taunt ids the relay accepts. Ids only, on purpose: no French
 * copy ever crosses the wire, so a hostile client cannot push arbitrary text
 * onto the other players' phones — it can only name one of these eight lines,
 * whose wording lives in `apps/web/src/components/live/taunts.ts`.
 *
 * Deliberately duplicated with the web list rather than shared through
 * `@degommix/game-core`: taunts are ephemeral decoration and must stay out of
 * the game protocol (see `plans/029-live-taunts.md`). Keep both lists in sync.
 */
export const TAUNT_IDS = [
  'crazy_romans',
  'you_tremble',
  'is_that_all_rome',
  'menhir_faster',
  'drink_the_potion',
  'idefix_plays_better',
  'stable_awaits',
  'by_toutatis',
] as const

export type TauntId = (typeof TAUNT_IDS)[number]

/** One taunt per player per minute — a game rule, not a flood guard. */
export const TAUNT_COOLDOWN_MS = 60_000
```

**Verify**: `pnpm --filter @degommix/ws-server typecheck` → exit 0.

### Step 2: Web taunt module (pure) + its unit tests

Create `apps/web/src/components/live/taunts.ts`. Ids must match step 1
character for character; the French copy is the owner-validated list of
Decision 2, with typographic apostrophes (’):

```ts
/**
 * The eight taunts of « Balance une vanne » — owner-validated copy, do not
 * reword. Purely decorative: a taunt is relayed over the socket, stamped for
 * 1.6 s on every phone of the table and forgotten. It is never persisted,
 * never journaled and never seen by the game reducer.
 *
 * Ids mirror `apps/ws-server/src/taunts.ts`, which whitelists them server-side.
 */
export interface Taunt {
  readonly id: TauntId
  readonly text: string
}

export type TauntId =
  | 'crazy_romans'
  | 'you_tremble'
  | 'is_that_all_rome'
  | 'menhir_faster'
  | 'drink_the_potion'
  | 'idefix_plays_better'
  | 'stable_awaits'
  | 'by_toutatis'

export const TAUNTS: readonly Taunt[] = [
  { id: 'crazy_romans', text: 'Ils sont fous ces Romains !' },
  { id: 'you_tremble', text: 'Tu trembles, Romain ?' },
  { id: 'is_that_all_rome', text: 'C’est tout ce que Rome envoie ?' },
  { id: 'menhir_faster', text: 'Mon menhir court plus vite que tes pions' },
  { id: 'drink_the_potion', text: 'Reviens quand tu auras bu la potion' },
  { id: 'idefix_plays_better', text: 'Même Idéfix joue mieux' },
  { id: 'stable_awaits', text: 'L’écurie t’attend, plein sabot' },
  { id: 'by_toutatis', text: 'Par Toutatis, quel carnage annoncé' },
]

/** One taunt per player per minute — mirrors the ws-server cooldown. */
export const TAUNT_COOLDOWN_MS = 60_000

/**
 * Hold before the picker opens. Shorter than the dev menu's 1500 ms (this is a
 * gameplay gesture, not a hidden door) but well above a deliberate tap, so the
 * dégommage taps of « Tape le portrait » never reach it.
 */
export const TAUNT_LONG_PRESS_MS = 600

/** How long the stamp stays on screen before it clears itself. */
export const TAUNT_DISPLAY_MS = 1600

/** True when `value` is one of the eight known ids (an unknown id is ignored). */
export function isTauntId(value: string): value is TauntId { … }

/** The French line of a taunt, or `null` for an id this client does not know. */
export function tauntText(id: string): string | null { … }

/**
 * Milliseconds left on the local cooldown. `lastSentAt` is `null` before the
 * first taunt of the game. Never negative.
 */
export function tauntCooldownRemaining(
  lastSentAt: number | null,
  now: number,
  cooldownMs: number = TAUNT_COOLDOWN_MS
): number { … }

/** Whole seconds left, rounded UP — what the « Encore N s » toast shows. */
export function cooldownSecondsLeft(remainingMs: number): number { … }
```

Implement the four functions (`isTauntId` via a `Set` or `.some`, no `any`).

Create `apps/web/src/components/live/taunts.test.ts`, modelled on
`apps/web/src/components/live/tap-lock.test.ts` (same directory, vitest,
`describe`/`it`), with exactly these 10 cases:

1. `TAUNTS` contains exactly 8 entries
2. every taunt id is unique
3. every taunt text is non-empty and uses the typographic apostrophe
   (assert `TAUNTS.every((t) => !t.text.includes("'"))`)
4. `isTauntId` accepts `'crazy_romans'`
5. `isTauntId` rejects `'not_a_taunt'`
6. `tauntText('crazy_romans')` returns `'Ils sont fous ces Romains !'`
7. `tauntText('not_a_taunt')` returns `null`
8. `tauntCooldownRemaining(null, 1000)` returns `0`
9. `tauntCooldownRemaining(1000, 1000)` returns `TAUNT_COOLDOWN_MS`, and
   `tauntCooldownRemaining(1000, 1000 + TAUNT_COOLDOWN_MS)` returns `0`
   (and never a negative number past the window)
10. `cooldownSecondsLeft(1)` returns `1` and `cooldownSecondsLeft(0)` returns `0`

**Verify**: `pnpm --filter @degommix/web test` → **32 files / 392 tests** pass
(382 baseline + 10 new).
**Verify**: `diff <(grep -oE "'[a-z_]+'" apps/ws-server/src/taunts.ts | sort -u) <(grep -oE "id: '[a-z_]+'" apps/web/src/components/live/taunts.ts | grep -oE "'[a-z_]+'" | sort -u)`
→ exit 0, no output (the two id lists are identical).

### Step 3: Extend the socket contract

Edit `apps/web/src/lib/realtime-types.ts`:

1. Add the broadcast payload next to the other payload interfaces (after
   `StatsInvalidatePayload`, before `ServerToClientEvents`):

```ts
/**
 * A taunt slammed by one player onto another, relayed to the whole game room
 * (the sender included). Ephemeral decoration: it is never persisted, never
 * part of the event log, and carries an id — not text — so the wire can never
 * transport player-authored strings. Clients ignore ids they do not know.
 */
export interface TauntPayload {
  gameId: string
  fromId: string
  targetId: string
  tauntId: string
}
```

2. Add one line to `ServerToClientEvents`, after `'game:kicked'`:

```ts
  'game:taunt': (payload: TauntPayload) => void
```

3. Add one entry to `CommandMap`, after `'game:resync'`:

```ts
  'game:send_taunt': {
    payload: { gameId: string; targetId: string; tauntId: string }
    result: Record<never, never>
  }
```

**Verify**: `pnpm --filter @degommix/web typecheck` → exit 0.

### Step 4: The server relay

Edit `apps/ws-server/src/handlers/game.ts`:

1. Imports: add `getGameOrThrow` to the existing
   `from '../lobby-shared'` import, and
   `import { TAUNT_COOLDOWN_MS, TAUNT_IDS } from '../taunts'`.
2. Next to the other schemas (after `replaySchema`, `game.ts:30`):

```ts
const tauntSchema = z.object({
  gameId: z.uuid(),
  targetId: z.string().min(1),
  tauntId: z.enum(TAUNT_IDS),
})
```

3. Register the handler inside `registerGameHandlers`, after the `game:resync`
   block:

```ts
  /**
   * « Balance une vanne » — pure decoration relayed to the game room. NOT a
   * game command: no `seq`, no `game_events` row, no reducer, no idempotency
   * key. The room emit reaches the sender too, so the whole table sees the
   * stamp at the same instant.
   *
   * The cooldown is keyed by USER, not by socket, unlike the flood guards
   * above: one taunt per minute is a game rule, and a socket-keyed window
   * would be defeated by a second tab. It is asserted BEFORE the DB reads so
   * a flood costs no queries; a taunt rejected afterwards still burns the
   * minute, which is harmless (the caller was not entitled to it anyway).
   */
  socket.on(
    'game:send_taunt',
    withAck(tauntSchema, async ({ gameId, targetId, tauntId }) => {
      limiter.assert(`${userId}:game:taunt`, 1, TAUNT_COOLDOWN_MS)
      const seat = await getSeat(db, gameId, userId)
      if (!seat || seat.status !== 'joined') throw new CommandError('NOT_MEMBER')
      const game = await getGameOrThrow(db, gameId)
      if (game.status !== 'active') throw new CommandError('GAME_NOT_ACTIVE')
      if (targetId === userId) throw new CommandError('INVALID_TARGET')
      io.to(`game:${gameId}`).emit('game:taunt', { gameId, fromId: userId, targetId, tauntId })
      return OK
    })
  )
```

Add `OK` to the existing `from '../ack'` import.

**Verify**: `pnpm --filter @degommix/ws-server typecheck` → exit 0.
**Verify**: `grep -n "gameEvents\|submitCommand\|manager\." apps/ws-server/src/handlers/game.ts`
→ no match inside the `game:send_taunt` block (the relay touches neither the
event log nor the game manager).

### Step 5: The long press on the opponent card

Edit `apps/web/src/components/live/opponent-card.tsx`.

1. Imports: `import { useRef } from 'react'`,
   `import { useLongPress } from '@/components/dev/use-long-press'`,
   `import { TAUNT_LONG_PRESS_MS } from './taunts'`.
2. Add one prop to `OpponentCardProps`, documented:

```ts
  /** Long press (600 ms) — opens the taunt picker for that opponent. */
  onLongPress: (targetId: string) => void
```

3. Inside the component, before the `return`:

```tsx
  // The long press fires while the finger is still down, so the `click` that
  // follows the lift would send a dégommage on top of the taunt. The flag
  // swallows exactly that click, and every new press clears it so a hold that
  // ends without a click (finger dragged off) cannot eat the next real tap.
  const suppressClickRef = useRef(false)
  const longPress = useLongPress(() => {
    suppressClickRef.current = true
    onLongPress(player.userId)
  }, TAUNT_LONG_PRESS_MS)
```

4. Rewrite the `<button>` handlers — write them out explicitly rather than
   spreading `{...longPress}`, so the `onPointerDown` and `onClick` wrappers
   cannot be silently overridden by JSX prop order:

```tsx
      <button
        type="button"
        className="opp-card"
        disabled={out || !canAct || isLocked}
        aria-busy={isPending}
        data-state={state}
        onPointerDown={(event) => {
          suppressClickRef.current = false
          longPress.onPointerDown(event)
        }}
        onPointerMove={longPress.onPointerMove}
        onPointerUp={longPress.onPointerUp}
        onPointerCancel={longPress.onPointerCancel}
        onPointerLeave={longPress.onPointerLeave}
        onContextMenu={longPress.onContextMenu}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
          }
          onTap(player.userId)
        }}
      >
```

5. Extend the component doc comment (`opponent-card.tsx:39-51`) with one
   sentence: a 600 ms hold opens the taunt picker instead of dégommant, and the
   card being `disabled` during the 1.2 s tap lock means no taunt during it
   either.

**Verify**: `pnpm --filter @degommix/web typecheck` → exit 0 (it will fail
until step 7 wires `onLongPress` in `live-screen.tsx` — that is expected;
run this verification again at the end of step 7).
**Verify**: `pnpm --filter @degommix/web lint` → exit 0.

### Step 6: Stamp CSS + gesture-proofing the card

Edit `apps/web/src/app/globals.css`.

1. In the `.opp-card` rule (currently `globals.css:682-706`), add two
   properties next to the existing `user-select: none;`:

```css
  -webkit-touch-callout: none;
  touch-action: manipulation;
```

with a short comment: « A 600 ms hold opens the taunt picker — iOS must not pop
its callout, and the double-tap zoom delay must not eat the gesture. » (same
pair as `.dev-longpress`, `globals.css:1571-1576`).

2. Append a new section after the dégommage-hit block (i.e. after
   `globals.css:1225`, before « End-of-game sequence »):

```css
/* ---------- Taunts (« Balance une vanne ») ---------- */

/**
 * Taunt stamp — the plan 011 hit stamp, promoted to a fullscreen slam. Fixed
 * overlay, `pointer-events: none`: it never blocks a tap on the board beneath.
 * Unlike `.hit-stamp` there is no a/b keyframe duplication — the React overlay
 * is remounted with a new `key` on every taunt, which restarts the animation
 * for free (no `next/image` to tear down).
 */
.taunt-zone {
  position: fixed;
  inset: 0;
  z-index: 45;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.taunt-stamp {
  max-width: 88vw;
  text-align: center;
  font-family: var(--font-display);
  font-size: clamp(1.25rem, 6.5vw, 2rem);
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--asterix);
  text-shadow:
    -2px -2px 0 var(--surface-2), 2px -2px 0 var(--surface-2),
    -2px 2px 0 var(--surface-2), 2px 2px 0 var(--surface-2),
    -3px 0 0 var(--surface-2), 3px 0 0 var(--surface-2),
    0 -3px 0 var(--surface-2), 0 3px 0 var(--surface-2),
    3px 3px 0 var(--ink);
  will-change: transform, opacity;
  animation: taunt-slam 1600ms cubic-bezier(0.2, 0.8, 0.3, 1) both;
}

/* Who taunted whom, under the stamp. */
.taunt-from {
  display: block;
  margin-top: 0.5rem;
  font-family: var(--font-body);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-soft);
  text-shadow: none;
}

@keyframes taunt-slam {
  0% { opacity: 0; transform: scale(2.6) rotate(-22deg); }
  14% { opacity: 1; transform: scale(0.94) rotate(-7deg); }
  22% { opacity: 1; transform: scale(1.06) rotate(-9.5deg); }
  34% { opacity: 1; transform: scale(1) rotate(-8deg); }
  82% { opacity: 1; transform: scale(1) rotate(-8deg); }
  100% { opacity: 0; transform: scale(1.1) rotate(-8deg); }
}

/* Reduced motion: the stamp still lands, it just does not slam. */
@keyframes taunt-hold {
  0% { opacity: 0; }
  10% { opacity: 1; }
  82% { opacity: 1; }
  100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .taunt-stamp { transform: rotate(-8deg); animation: taunt-hold 1600ms ease both; }
}
```

3. Mirror the reduced-motion override in the playground block, next to
   `globals.css:1613-1616`:

```css
[data-motion='reduced'] .taunt-stamp { transform: rotate(-8deg); animation: taunt-hold 1600ms ease both; }
```

**Verify**: `grep -c "taunt-slam\|taunt-hold" apps/web/src/app/globals.css` → `5`
(one `@keyframes` + one use each, plus the `[data-motion='reduced']` use).
**Verify**: `grep -n "touch-callout" apps/web/src/app/globals.css` → 2 matches
(`.dev-longpress` and `.opp-card`).

### Step 7: The taunt hook, the picker, the stamp, and the wiring

**7a. `apps/web/src/components/live/use-taunts.ts`** — subscribes to the
broadcast, owns the local cooldown, sends the command:

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Ack } from '@degommix/game-core'
import { useSocket } from '@/components/socket-provider'
import { emitWithAck, timeoutAck } from '@/lib/socket'
import type { TauntPayload } from '@/lib/realtime-types'
import {
  isTauntId,
  tauntCooldownRemaining,
  TAUNT_DISPLAY_MS,
  type TauntId,
} from './taunts'

export interface ActiveTaunt {
  /** Bumped on every taunt — used as the overlay's React key to restart the CSS. */
  seq: number
  fromId: string
  targetId: string
  tauntId: TauntId
}

export interface UseTauntsResult {
  /** The taunt currently on screen, or `null`. */
  current: ActiveTaunt | null
  /** Local cooldown left, in ms — 0 when the viewer may taunt. */
  cooldownRemainingMs: () => number
  send: (targetId: string, tauntId: TauntId) => Promise<Ack<Record<never, never>>>
}
```

Rules to implement:

- `socket.on('game:taunt', …)`, `socket.off` in the effect cleanup — the same
  shape as `useGame`'s effect (`use-game.ts:86-98`).
- Ignore a payload whose `gameId !== gameId` (mirrors `use-game.ts:74`) and
  whose `tauntId` fails `isTauntId` (an id from a newer server).
- On a valid payload: `setCurrent({ seq: seqRef.current++, … })`, and arm a
  `setTimeout(TAUNT_DISPLAY_MS)` that clears it. Clear any previous timer
  first, so back-to-back taunts do not leave a stale timer that would blank the
  newer stamp early. Clear the timer on unmount.
- `lastSentAtRef: useRef<number | null>(null)`; `cooldownRemainingMs()` returns
  `tauntCooldownRemaining(lastSentAtRef.current, Date.now())`. A ref, not
  state: the value is read on demand inside the long-press handler, and it must
  not re-render the live board.
- `send(targetId, tauntId)`: set `lastSentAtRef.current = Date.now()` **before**
  emitting (the local window then always closes earlier than the server's,
  which starts on receipt — so the client is strictly the stricter of the two
  and never gets a surprise `RATE_LIMITED`), then
  `await emitWithAck(socket, 'game:send_taunt', { gameId, targetId, tauntId })`.
  On a failed ack, reset `lastSentAtRef.current = null` (the taunt never
  landed) and return the ack so the caller can toast it. With no socket,
  return `timeoutAck()`.
- Do **not** use `sendGameCommand`: its 3-attempt retry would slam the table
  two or three times.

**7b. `apps/web/src/components/live/taunt-picker.tsx`** — the `Sheet`:

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { Sheet } from './overlay'
import { TAUNTS, type TauntId } from './taunts'

interface TauntPickerProps {
  targetName: string
  onPick: (tauntId: TauntId) => void
  onClose: () => void
}

/** « Balance une vanne » — 8 fixed lines, one tap, then the sheet closes. */
export function TauntPicker({ targetName, onPick, onClose }: TauntPickerProps) { … }
```

Title: `` `Balance une vanne à ${targetName}` ``. Body: the 8 taunts as
full-width row buttons using the `end-request-sheet.tsx:96-104` styling
(`rounded-xl border-2 p-2 text-sm font-bold`, `--parchment-line` border,
`--surface` background), plus a `<Button variant="ghost">Retour</Button>`
calling `onClose`. Each row calls `onPick(taunt.id)`.

**7c. `apps/web/src/components/live/taunt-stamp.tsx`** — the overlay:

```tsx
'use client'

import { displayName, type NameMap } from './types'
import { tauntText } from './taunts'
import type { ActiveTaunt } from './use-taunts'

interface TauntStampProps {
  taunt: ActiveTaunt
  names: NameMap
}

/**
 * Fullscreen taunt slam. Mounted with `key={taunt.seq}` by the live screen, so
 * a repeated taunt remounts and restarts the CSS animation, and unmounted by
 * the hook after `TAUNT_DISPLAY_MS`. Announced politely: the line is content,
 * not chrome — a player using a screen reader must hear the trash talk too.
 */
export function TauntStamp({ taunt, names }: TauntStampProps) { … }
```

Markup:

```tsx
    <div className="taunt-zone" role="status" aria-live="polite">
      <p className="taunt-stamp">
        {text}
        <span className="taunt-from">
          {displayName(names, taunt.fromId)} → {displayName(names, taunt.targetId)}
        </span>
      </p>
    </div>
```

`const text = tauntText(taunt.tauntId)`; if it is `null`, render `null`
(defence in depth — the hook already filters unknown ids).

**7d. Wire it in `apps/web/src/components/live/live-screen.tsx`**:

- Imports: `TauntPicker`, `TauntStamp`, `useTaunts`, and
  `cooldownSecondsLeft` from `./taunts`.
- Near `const tapLock = useTapLock()`:

```tsx
  const taunts = useTaunts(gameId)
  const [tauntTargetId, setTauntTargetId] = useState<string | null>(null)
```

- Next to `handleTap`:

```tsx
  /**
   * A 600 ms hold opens the vanne picker. The local cooldown gates the picker
   * itself — no countdown UI, just the remaining seconds in a toast — while
   * the ws-server stays the authority (a taunt sent from another tab comes
   * back RATE_LIMITED and is toasted like any other failed ack).
   */
  const handleLongPress = (targetId: string): void => {
    const remaining = taunts.cooldownRemainingMs()
    if (remaining > 0) {
      toast(`Encore ${cooldownSecondsLeft(remaining)} s avant la prochaine vanne`)
      return
    }
    setTauntTargetId(targetId)
  }

  const sendTaunt = async (targetId: string, tauntId: TauntId): Promise<void> => {
    const ack = await taunts.send(targetId, tauntId)
    if (!ack.ok) toast(ackErrorMessage(ack), 'error')
  }
```

- Pass `onLongPress={handleLongPress}` to `<OpponentCard />`.
- Render both overlays inside the returned `<main>`, after the
  `HostDecisionModal` block:

```tsx
      {tauntTargetId !== null ? (
        <TauntPicker
          targetName={displayName(names, tauntTargetId)}
          onPick={(tauntId) => {
            const targetId = tauntTargetId
            setTauntTargetId(null)
            void sendTaunt(targetId, tauntId)
          }}
          onClose={() => setTauntTargetId(null)}
        />
      ) : null}

      {taunts.current ? (
        <TauntStamp key={taunts.current.seq} taunt={taunts.current} names={names} />
      ) : null}
```

Note the placement: both are inside the live board's `return`, i.e. only while
`state.status !== 'finished'` — the `Summary` early-return at
`live-screen.tsx:122-134` means no taunt UI on a finished game, which matches
the server's `GAME_NOT_ACTIVE` guard.

**Verify**: `pnpm --filter @degommix/web typecheck` → exit 0.
**Verify**: `pnpm --filter @degommix/web lint` → exit 0.
**Verify**: `pnpm --filter @degommix/web test` → 392 tests pass (unchanged
from step 2 — components carry no unit tests in this repo).

### Step 8: Manual check in a browser (two tabs)

Run `pnpm dev`, open the live screen of the same game in two browser profiles
(or a normal + a private window, one account each), and confirm:

1. A short tap on an opponent card still sends a dégommage (counter moves, hit
   animation plays) — the gesture did not break the « Tape le portrait » tap.
2. A 600 ms hold opens « Balance une vanne à … » and sends **no** dégommage on
   release (the counter must not move).
3. Picking a line stamps it on **both** tabs at the same moment, then clears
   after ~1.6 s.
4. Holding again within the minute toasts « Encore N s avant la prochaine
   vanne » and does not open the picker.
5. With the OS reduced-motion setting on, the stamp appears and fades without
   the slam.

This step has no automated gate; report what you observed. If (2) fails —
a phantom dégommage after a hold — treat it as a STOP condition, it is the
exact risk this plan is rated MED for.

### Step 9: ws-server integration tests

Create `apps/ws-server/test/taunts.test.ts`, modelled on
`apps/ws-server/test/game-commands.test.ts` (same imports, same
`beforeAll`/`afterAll`/`beforeEach` shape, `startGameWith` from `./flows`).

> **READ THIS BEFORE WRITING THE TESTS.** The cooldown key is
> `` `${userId}:game:taunt` `` and `RateLimiter` is an in-memory `Map` held by
> the server instance created once in `beforeAll`. `ts.reset()` truncates the
> **database**, not the limiter. Since the limit is 1 per 60 s and the whole
> file runs in far less than a minute, **a user who taunts in one test is still
> rate-limited in the next one**. Therefore: give every test its own sender.
> Reset with `await ts.reset(['u1', 'u2', 'u3', 'u4', 'u5', 'u6'])` and use the
> sender named below in each case. Do NOT "fix" this by adding a clock seam to
> `RateLimiter` or `createWsServer` — both are out of scope.

The five cases:

1. **relays to the whole room, sender included** — `startGameWith(ts, ['u1','u2','u3'])`;
   attach `waitForEvent(sX, 'game:taunt')` on all three sockets **before**
   emitting; `emitAck(s1, 'game:send_taunt', { gameId, targetId: 'u2', tauntId: 'crazy_romans' })`
   → `expectOk`; all three payloads equal
   `{ gameId, fromId: 'u1', targetId: 'u2', tauntId: 'crazy_romans' }`.
2. **writes no game event** — same game (sender `u4`, i.e.
   `startGameWith(ts, ['u4','u5'])`): count
   `db.select().from(gameEvents).where(eq(gameEvents.gameId, gameId))` before
   and after a successful taunt, assert the lengths are equal (this is the
   machine check for Decision 1; `game-commands.test.ts:90-98` is the pattern).
3. **enforces the one-per-minute cooldown** — sender `u6` in a
   `startGameWith(ts, ['u6','u1'])` game: first taunt `expectOk`; second taunt
   → `expect(ack).toMatchObject({ ok: false, code: 'RATE_LIMITED' })` and
   `await expectNoEvent(otherSocket, 'game:taunt', 250)`.
   (`u1` may be a *seat* in several tests — only the *sender* id must be
   unique per test.)
4. **rejects a non-member** — `startGameWith(ts, ['u1','u2'])`, then
   `const s3 = await ts.connectAs('u3')` and taunt from `s3` →
   `{ ok: false, code: 'NOT_MEMBER' }`.
5. **rejects an unknown taunt id** — sender `u5` (fresh in this test):
   `emitAck(s, 'game:send_taunt', { gameId, targetId, tauntId: 'not_a_taunt' })`
   → `{ ok: false, code: 'INTERNAL' }` (Zod rejection through `withAck`,
   `ack.ts:39-42`), and `expectNoEvent` on the opponent's socket.

Cross-check your sender assignment before running: each of the five cases must
use a sender id that no earlier case in the file used as a **sender**.

**Verify**: `docker compose -f docker-compose.test.yml up -d` then
`pnpm --filter @degommix/ws-server test` → all pass, including the 5 new tests
in `taunts.test.ts`.

### Step 10: Full verification pass

From the repo root, in order:

1. `pnpm lint` → exit 0.
2. `pnpm typecheck` → exit 0.
3. `pnpm --filter @degommix/web test` → **32 files / 392 tests** pass.
4. `docker compose -f docker-compose.test.yml up -d` then
   `pnpm exec turbo run test --concurrency=1` → all pass.
5. `pnpm test:e2e` → passes with `e2e/**` unmodified.
6. `git status --porcelain` → only the 12 in-scope files (10 listed under
   "In scope" + `plans/029-live-taunts.md`'s status row in `plans/README.md`).

## Test plan

- **New web unit tests** — `apps/web/src/components/live/taunts.test.ts`, the
  10 cases enumerated in step 2 (list shape and uniqueness, the verbatim copy
  of one line, apostrophe convention, `isTauntId` accept/reject, `tauntText`
  known/unknown, cooldown at 0 / full / expired / never negative, second
  rounding). Structural pattern: `apps/web/src/components/live/tap-lock.test.ts`.
- **New ws-server integration tests** — `apps/ws-server/test/taunts.test.ts`,
  the 5 cases of step 9. Structural pattern:
  `apps/ws-server/test/game-commands.test.ts`. Case 2 (« writes no game
  event ») is the regression guard for the hard boundary of Decision 1 — do
  not drop it.
- **No component tests**: `apps/web/vitest.config.ts` runs in the `node`
  environment and the repo has no jsdom / @testing-library. The picker, the
  stamp and the gesture wiring are covered by typecheck, lint, the manual
  two-tab check of step 8, and the unchanged e2e suite.
- **No e2e changes**: `e2e/**` must pass untouched. The taunt UI is behind a
  600 ms hold that no existing spec performs.
- Verification: `pnpm --filter @degommix/web test` → 392 tests;
  `pnpm --filter @degommix/ws-server test` → all pass with 5 new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm lint` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm --filter @degommix/web test` exits 0 — 32 files / **392** tests
      (382 baseline + 10 new)
- [ ] `pnpm --filter @degommix/ws-server test` exits 0 with the 5 new tests in
      `apps/ws-server/test/taunts.test.ts`
- [ ] `pnpm test:e2e` exits 0 with `e2e/**` unmodified
- [ ] `git status --porcelain packages/` → **empty** (game-core and db are
      untouched — the hard boundary of Decision 1)
- [ ] `git diff --stat 08f1da1..HEAD -- apps/web/src/components/dev/ apps/web/src/components/live/tap-lock.ts apps/web/src/components/live/use-tap-lock.ts apps/ws-server/src/rate-limit.ts apps/ws-server/src/game-manager.ts`
      → **empty** (the reused modules are reused, not edited)
- [ ] `diff <(grep -oE "'[a-z_]+'" apps/ws-server/src/taunts.ts | sort -u) <(grep -oE "id: '[a-z_]+'" apps/web/src/components/live/taunts.ts | grep -oE "'[a-z_]+'" | sort -u)`
      → exit 0 (the two id lists are identical)
- [ ] `grep -c "text: '" apps/web/src/components/live/taunts.ts` → `8`, and
      `grep -n "Idéfix\|Toutatis\|menhir\|potion\|écurie\|trembles\|Romains\|Rome envoie" apps/web/src/components/live/taunts.ts`
      → the 8 owner-validated lines, verbatim
- [ ] `grep -rn "game:taunt\|game:send_taunt" apps/web/src apps/ws-server/src --include="*.ts*" | grep -v "\.test\."`
      → matches only in `realtime-types.ts`, `use-taunts.ts`,
      `handlers/game.ts` (no journal, no summary, no stats file)
- [ ] `grep -rn "taunt" apps/web/src/components/live/live-journal.tsx apps/web/src/components/live/use-live-journal.ts apps/web/src/components/live/summary.tsx apps/web/src/lib/queries/game-detail-journal.ts`
      → no matches (taunts never enter the journal or the archive)
- [ ] `grep -c "suppressClickRef" apps/web/src/components/live/opponent-card.tsx`
      → `5` (declaration, set on fire, cleared on pointer down, checked in
      `onClick`, cleared in `onClick`)
- [ ] `grep -n "taunt-slam\|taunt-hold\|touch-callout" apps/web/src/app/globals.css`
      → the stamp keyframes, both reduced-motion overrides, and `.opp-card`'s
      callout suppression
- [ ] Step 8 performed and reported, in particular that a 600 ms hold sends no
      dégommage
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- **The implementation seems to need a reducer, protocol or schema change** —
  a new `GameEvent` type, a `Command` variant, a new `ErrorCode`, a
  `gameEvents` insert, a drizzle migration, or any edit under
  `packages/game-core/**` or `packages/db/**`. Taunts are ephemeral decoration
  (Decision 1); if the design pulls you there, the design is wrong, not the
  boundary. Report what forced it.
- **A long press produces a dégommage** (step 8, check 2), or a normal tap
  stops registering after a hold that ended off the card. The click-suppression
  flag is the load-bearing part of this plan; report the exact sequence rather
  than adding `preventDefault()`/`stopPropagation()` calls until it seems to
  work.
- The `game:taunt` broadcast does **not** reach the sender in test case 1 —
  that means the room emit was written as `socket.broadcast.to(…)` or the
  sender's socket is not in `game:{gameId}`; report instead of adding a
  client-side optimistic stamp.
- Test case 3 (cooldown) passes but case 1 or 5 fails with `RATE_LIMITED` —
  your sender ids collide across tests (see the warning in step 9). Fix the ids;
  if that does not resolve it, report rather than touching `rate-limit.ts` or
  `server.ts`.
- The excerpts in "Current state" no longer match the live code (drift since
  `08f1da1`) — in particular if `.opp-card` already carries pointer handlers,
  if `useLongPress` no longer accepts a `holdMs` argument, if `RateLimiter.assert`
  changed signature, or if a `game:taunt` event already exists.
- Baseline `pnpm lint` / `pnpm typecheck` / `pnpm --filter @degommix/web test`
  fail BEFORE your first edit, or the web baseline is not 382 tests (the plan's
  arithmetic for 392 would then be wrong — report the real number, do not
  silently adjust the target).
- **File-level overlap with plans 030 and 037.** Both also touch
  `live-screen.tsx` / `opponent-card.tsx` (030: journal stamps; 037: arena
  sounds). If one of them has already landed on this branch's base, rebase your
  work on top of it rather than reverting their edits; if both are mid-flight
  and conflicting, STOP and report — whichever plan lands second rebases.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **Reviewer focus, in order**: (1) the click-suppression flag in
  `opponent-card.tsx` — set when the hold fires, cleared on every new
  `pointerdown`, checked and cleared in `onClick`; a hold must never reach
  `handleTap`. (2) The handler in `handlers/game.ts` writes nothing: no
  `gameEvents`, no `manager.submitCommand`, no `seq`. (3) The limiter key is
  per-**user**, not per-socket (Decision 3). (4) The relay is
  `io.to(room).emit`, not `socket.broadcast.to(room).emit` (Decision 5).
  (5) The two id lists are still in sync.
- **The two id lists will drift eventually.** If a ninth taunt is ever added,
  it must be added to `apps/ws-server/src/taunts.ts` **and**
  `apps/web/src/components/live/taunts.ts`, and the ws-server must be deployed
  before (or with) the web app — an id the server does not whitelist is
  rejected with `INTERNAL`. The client already ignores ids it does not know,
  so the reverse order is safe.
- **Deferred on purpose**: (a) moving `components/dev/long-press.ts` to a
  neutral home now that live gameplay imports it — a pure rename, kept out of
  this plan so the diff stays reviewable and so plans 030/037 do not conflict
  on it; (b) a taunt demo in `/dev/animations` (plan 014's playground), which
  would need a fake `ActiveTaunt` and is not worth the surface here;
  (c) taunt *reactions* or a per-game taunt count — both would need persistence
  and therefore a different plan with a different boundary.
- **What interacts with this later**: if Web Push or a spectator mode ever
  lands, taunts must stay out of both — they are a same-table, same-minute
  effect. If the ws-server is ever scaled to more than one instance, the
  in-memory `RateLimiter` stops being global and the cooldown becomes
  per-instance; that affects `friends:request` and `game:command` identically
  and should be solved once, for all three, in the limiter — not here.
- **Tuning knobs**, all in `apps/web/src/components/live/taunts.ts`:
  `TAUNT_LONG_PRESS_MS` (600), `TAUNT_DISPLAY_MS` (1600), `TAUNT_COOLDOWN_MS`
  (60 000, must stay equal to the ws-server constant). If playtests report
  accidental picker openings, raise the hold before touching anything else.
