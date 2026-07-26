# Plan 020: Give the PWA a crash floor and make client crashes visible in Railway logs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 8890290..HEAD -- apps/web/src/app apps/web/src/lib apps/web/src/components`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `8890290`, 2026-07-26

## Why this matters

Today an unhandled render/runtime error in the web app has no floor: there is
not a single `error.tsx` or `global-error.tsx` anywhere under
`apps/web/src/app`, so a production crash leaves the player on Next.js's bare
default error screen — no French copy, no arcade styling, no way back into the
game. Worse, nobody ever learns it happened: the web app has zero client error
reporting (no `console.*` call in `apps/web/src`, no tracking dependency), so
crashes on players' phones are invisible while the ws-server already logs
structured JSON errors to Railway. Because the server replays the full event
log to any reconnecting socket (`game:state_snapshot`), a plain page reload
genuinely heals a crash mid-game — so a « Recharger » button is not a
consolation prize, it is a real recovery path. This plan adds (1) styled French
error boundaries for the game-critical routes plus a global fallback, (2) a
session-gated `POST /api/client-error` route that emits one structured JSON log
line matching the ws-server convention, and (3) a small fire-and-forget client
reporter wired into the boundaries. No third-party SDK: Sentry is explicitly
deferred (see Maintenance notes).

## Current state

All facts below were verified at commit `8890290`.

### No crash floor exists

`find apps/web/src/app -name "error.tsx" -o -name "global-error.tsx"` returns
nothing. `grep -rn "console\." apps/web/src` returns nothing. No error-tracking
dependency exists anywhere (`grep -rin "sentry\|posthog\|datadog\|bugsnag\|logrocket" apps/web/package.json apps/ws-server/package.json package.json pnpm-lock.yaml`
returns nothing).

### App route structure (Next 15.5.21, App Router, React 19)

```
apps/web/src/app/
├── layout.tsx                  # root layout: <html lang="fr">, ThemeScript, ToastProvider, SplashGate
├── globals.css                 # design tokens + .cta arcade button (1887 lines)
├── (auth)/login|register|onboarding
├── (tabs)/                     # tab screens: layout.tsx + jouer, parties, amis, classement, profil
├── lobby/[gameId]/page.tsx     # lobby (no layout.tsx of its own)
├── partie/[gameId]/            # live game: layout.tsx (QueryProvider+SocketProvider) + page.tsx
├── dev/animations, dev/ui      # hidden dev pages
└── api/...                     # route handlers
```

### Reload heals a live-game crash (verified)

`apps/ws-server/src/server.ts:205-213` — on (re)connection, an active-game
member receives the full event log again, so the client rebuilds identical
state from scratch:

```ts
} else if (seated.game.status === 'active') {
  const events = await ctx.manager.getEventsSince(seated.game.id, 0)
  socket.emit('game:state_snapshot', {
    gameId: seated.game.id,
    events,
    serverNow: Date.now(),
    hostId: seated.game.hostId,
  })
}
```

### The ws-server structured log convention to match

`apps/ws-server/src/server.ts:215-222` (same shape at `apps/ws-server/src/ack.ts:53-59`
with `scope: 'ws-handler'` and stack included, and `apps/ws-server/src/zombie-job.ts:87-93`
with `scope: 'zombie-job'`):

```ts
console.error(
  JSON.stringify({
    level: 'error',
    scope: 'connection',
    userId,
    error: error instanceof Error ? error.message : String(error),
  })
)
```

Keys are `level`, `scope`, `userId` (when known), `error`. The new client-error
log line MUST reuse these exact keys (extra keys are allowed) so one Railway
log query covers server and client errors.

### Session gate pattern for API routes

`apps/web/src/lib/session.ts:35-39` — the route-handler gate:

```ts
export async function getOnboardedApiSession(): Promise<OnboardedSession | null> {
  const session = await getSession()
  if (!session?.user.username) return null
  return { user: { id: session.user.id, username: session.user.username } }
}
```

`apps/web/src/app/api/leaderboard/route.ts:15-19` — how routes use it:

```ts
export async function GET() {
  const session = await getOnboardedApiSession()
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
```

Note: `apps/web/src/app/api/username/route.ts:27-31` gates on a plain session
(no username requirement) because it serves onboarding. The client-error route
will do the same — a crash on `/onboarding` must still be reportable — using
`getSession()` from `@/lib/session` and answering 401 when null.
Unauthenticated crashes (on `/login`) are deliberately dropped; recorded in
Maintenance notes.

### Zod validation pattern in routes

`apps/web/src/app/api/username/route.ts:8-14, 32-36` (zod v4 is already a
direct dependency of `@degommix/web`):

```ts
const bodySchema = z.object({
  username: z.string().min(1).max(20).regex(/^[a-zA-Z0-9_.-]+$/),
})
// ...
const body: unknown = await request.json().catch(() => null)
const parsed = bodySchema.safeParse(body)
if (!parsed.success) {
  return NextResponse.json({ error: 'INVALID_USERNAME' }, { status: 400 })
}
```

### Design tokens and the arcade CTA

`apps/web/src/app/globals.css` defines the palette as CSS custom properties on
`:root` (light), with a `@media (prefers-color-scheme: dark)` block AND
`:root[data-theme="dark"]` / `:root[data-theme="light"]` overrides (the
`ThemeScript` in the root layout stamps `data-theme` from localStorage before
first paint). Key values:

| Token | Light | Dark |
|---|---|---|
| `--parchment` (page bg) | `#ece0c4` | `#1c150d` |
| `--ink` (text) | `#251a10` | `#f1e3c2` |
| `--ink-soft` | `#6d5a3f` | `#cbb98c` |
| `--bronze` (CTA bg) | `#8c5a2b` | `#d79a4b` |
| `--surface-2` (CTA text) | `#fbf6e9` | `#2b2115` |

The primary button class is `.cta` (`globals.css:198`): full-width uppercase
Cinzel key with a pressed-down mechanic. Inside the root layout (i.e. in every
segment `error.tsx`) use `<button className="cta">` directly — do NOT re-style.
`global-error.tsx` replaces the root layout entirely, so `globals.css`, the
Cinzel font and `ThemeScript` are NOT available there — it must inline its own
minimal styling (see Step 6).

### French copy tone

Existing user-facing error strings are informal French with tutoiement, see
`apps/web/src/lib/ws-errors.ts:5-30`, e.g.
`INTERNAL: 'Une erreur est survenue, réessaie'` and
`RATE_LIMITED: 'Doucement ! Réessaie dans un instant'`. Game flavor uses
Astérix references (`Par Toutatis !` in `apps/web/src/lib/degommage-messages.ts`).
Exact copy to use is given in Step 5 — do not invent different copy.

### Next.js error-file conventions (Next 15)

- `error.tsx` must be a Client Component (`'use client'`); it receives
  `{ error: Error & { digest?: string }, reset: () => void }`. It catches
  errors thrown in the same segment's `page.tsx` and below, NOT in the same
  segment's `layout.tsx`.
- `global-error.tsx` sits in `app/`, must be a Client Component, and MUST
  render its own `<html>` and `<body>` tags because it replaces the root
  layout when active. It only renders in production builds — in `next dev`
  the error overlay shows instead.
- If unsure, verify with context7 docs for Next.js 15 "error.js file convention"
  before writing the files.

### Dev-page gating pattern

`apps/web/src/app/dev/ui/page.tsx:11-13`:

```ts
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_UI !== '1') {
  notFound()
}
```

## Commands you will need

Run from the repo root. `apps/web/.env` already exists locally, so dev and
build work without extra setup.

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck (web) | `pnpm --filter @degommix/web typecheck` | exit 0, no errors |
| Lint (web) | `pnpm --filter @degommix/web lint` | exit 0 |
| Unit tests (web) | `pnpm --filter @degommix/web test` | all pass |
| Dev server | `pnpm --filter @degommix/web dev` | serves on http://localhost:3000 |
| Prod build | `pnpm --filter @degommix/web build` | exit 0, "Compiled successfully" |
| Prod server | `pnpm --filter @degommix/web start` | serves on http://localhost:3000 |
| Whole-repo check | `pnpm typecheck && pnpm lint && pnpm test` | exit 0 |

## Suggested executor toolkit

- `next-best-practices` skill (if available) — file conventions and RSC
  boundaries when writing `error.tsx` / `global-error.tsx`.
- context7 (if available) — confirm Next 15 error-file props/behavior before
  Step 5/6.

## Scope

**In scope** (the only files you should create/modify — all under `apps/web/src` unless noted):

- `lib/client-error.ts` (create) — zod schema + log-line formatter
- `lib/client-error.test.ts` (create)
- `lib/client-error-reporter.ts` (create) — fire-and-forget browser reporter
- `lib/client-error-reporter.test.ts` (create)
- `app/api/client-error/route.ts` (create)
- `components/error/crash-screen.tsx` (create) — shared boundary UI
- `app/(tabs)/error.tsx` (create)
- `app/partie/[gameId]/error.tsx` (create)
- `app/lobby/[gameId]/error.tsx` (create)
- `app/global-error.tsx` (create)
- `app/dev/crash/page.tsx` (create) — gated crash trigger for verification
- `plans/README.md` (status row only, at the end)

**Out of scope** (do NOT touch, even though they look related):

- Any third-party error SDK (Sentry, PostHog, …) — explicitly deferred; do not
  add dependencies to any `package.json`.
- `apps/ws-server/**` — its logging is the convention we match, not a thing to
  change.
- `app/(auth)/**` error boundaries — the global boundary covers them; adding
  more is scope creep.
- Alerting, log retention, server-side rate limiting beyond the zod size caps,
  offline queueing of reports, e2e specs in `e2e/`.
- `app/layout.tsx`, `app/globals.css`, existing routes/components — no edits.
- Service worker (`@serwist/next`) config.

## Git workflow

- Branch: `fix/crash-floor-client-errors` (repo convention: `type/short-slug`,
  see branches `fix/post-playtest-round-1`, `fix/ui-polish-home-history-avatar`)
- Conventional commits, lowercase scope, e.g. from `git log`:
  `feat(web): invalidate home and leaderboard caches when a game finishes`.
  Suggested: one commit per step or `feat(web): crash floor with error boundaries and client error reporting`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the shared payload schema and log formatter

Create `apps/web/src/lib/client-error.ts`. Keeping schema + formatting in
`lib/` (thin route on top) matches how this repo tests route logic
(`lib/*.test.ts` co-located, vitest).

```ts
import { z } from 'zod'

/** Wire limits — the client truncates before sending, the server enforces. */
export const CLIENT_ERROR_LIMITS = {
  message: 500,
  stack: 4000,
  route: 200,
  userAgent: 300,
  digest: 100,
} as const

export const clientErrorSchema = z.object({
  message: z.string().min(1).max(CLIENT_ERROR_LIMITS.message),
  stack: z.string().max(CLIENT_ERROR_LIMITS.stack).optional(),
  digest: z.string().max(CLIENT_ERROR_LIMITS.digest).optional(),
  route: z.string().min(1).max(CLIENT_ERROR_LIMITS.route),
  userAgent: z.string().max(CLIENT_ERROR_LIMITS.userAgent).optional(),
})

export type ClientErrorReport = z.infer<typeof clientErrorSchema>

/**
 * One structured JSON line per crash, matching the ws-server convention
 * ({level, scope, userId, error} — see apps/ws-server/src/server.ts:215) so a
 * single Railway log query covers server and client errors.
 */
export function formatClientErrorLine(userId: string, report: ClientErrorReport): string {
  return JSON.stringify({
    level: 'error',
    scope: 'client',
    userId,
    route: report.route,
    digest: report.digest,
    userAgent: report.userAgent,
    error: report.stack ? `${report.message}\n${report.stack}` : report.message,
  })
}
```

**Verify**: `pnpm --filter @degommix/web typecheck` → exit 0.

### Step 2: Create `POST /api/client-error`

Create `apps/web/src/app/api/client-error/route.ts`. Gate on a plain session
(`getSession` from `@/lib/session`, like the username route — crashes during
onboarding must be reportable); answer like the leaderboard route otherwise.

```ts
import { NextResponse } from 'next/server'
import { clientErrorSchema, formatClientErrorLine } from '@/lib/client-error'
import { getSession } from '@/lib/session'

/**
 * Client crash sink: one structured JSON line to stdout per report so browser
 * crashes land in the Railway logs next to the ws-server's error lines.
 * Session-gated (plain session, not onboarded: /onboarding crashes count too).
 * No third-party SDK by design — Sentry is deferred (plans/020).
 */
export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }
  const body: unknown = await request.json().catch(() => null)
  const parsed = clientErrorSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REPORT' }, { status: 400 })
  }
  console.error(formatClientErrorLine(session.user.id, parsed.data))
  return NextResponse.json({ ok: true })
}
```

Note: `console.error` here is intentional and mirrors the ws-server logging
convention; it is the log transport, not a leftover debug statement.

**Verify**: `pnpm --filter @degommix/web typecheck && pnpm --filter @degommix/web lint` → both exit 0.

### Step 3: Create the client reporter

Create `apps/web/src/lib/client-error-reporter.ts`. Fire-and-forget, swallow
every failure (a reporter must never cause a second crash), client-side cap of
3 reports per page lifetime to prevent report loops. Factory shape so the cap
and truncation are unit-testable without `fetch`.

```ts
import { CLIENT_ERROR_LIMITS, type ClientErrorReport } from './client-error'

export const MAX_REPORTS_PER_SESSION = 3

export interface ReportableError {
  message: string
  stack?: string
  digest?: string
}

type PostReport = (body: string) => Promise<unknown>

/**
 * Builds a crash reporter around a POST transport. Fire-and-forget: failures
 * are swallowed (never crash on reporting a crash) and at most
 * MAX_REPORTS_PER_SESSION reports leave one page lifetime (loop guard).
 */
export function createClientErrorReporter(post: PostReport): (error: ReportableError, route: string, userAgent?: string) => void {
  let sent = 0
  return (error, route, userAgent) => {
    if (sent >= MAX_REPORTS_PER_SESSION) return
    sent += 1
    const report: ClientErrorReport = {
      message: (error.message || 'Unknown client error').slice(0, CLIENT_ERROR_LIMITS.message),
      stack: error.stack?.slice(0, CLIENT_ERROR_LIMITS.stack),
      digest: error.digest?.slice(0, CLIENT_ERROR_LIMITS.digest),
      route: route.slice(0, CLIENT_ERROR_LIMITS.route),
      userAgent: userAgent?.slice(0, CLIENT_ERROR_LIMITS.userAgent),
    }
    void post(JSON.stringify(report)).catch(() => {
      /* reporting must never throw */
    })
  }
}

/** Default browser reporter, POSTing to /api/client-error. */
export const reportClientError = createClientErrorReporter((body) =>
  fetch('/api/client-error', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  })
)
```

**Verify**: `pnpm --filter @degommix/web typecheck` → exit 0.

### Step 4: Write the unit tests

Create `apps/web/src/lib/client-error.test.ts` and
`apps/web/src/lib/client-error-reporter.test.ts`. Model structure after
`apps/web/src/lib/ws-errors.test.ts` (vitest, `describe`/`it`, co-located).
Cases required — see Test plan for the full list.

**Verify**: `pnpm --filter @degommix/web test` → all pass, including the new
files (vitest prints them in the run summary).

### Step 5: Create the shared crash screen and the three segment boundaries

Create `apps/web/src/components/error/crash-screen.tsx` (Client Component).
It reports on mount and offers a full-reload CTA. A full reload — not Next's
`reset()` — is the healing path: server components re-run and the socket
handshake replays the whole game via `game:state_snapshot` (Current state).

```tsx
'use client'

import { useEffect } from 'react'
import { reportClientError } from '@/lib/client-error-reporter'

interface CrashScreenProps {
  error: Error & { digest?: string }
}

/**
 * Crash floor for a route segment. Rendered inside the root layout, so
 * globals.css tokens and the .cta key are available. « Recharger » does a full
 * reload on purpose: the ws-server replays the complete event log on
 * reconnection, so a live game rebuilds itself losslessly.
 */
export function CrashScreen({ error }: CrashScreenProps) {
  useEffect(() => {
    reportClientError(error, window.location.pathname, navigator.userAgent)
  }, [error])

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-extrabold uppercase tracking-wide text-ink" style={{ fontFamily: 'var(--font-display)' }}>
        Par Toutatis, un pépin !
      </h1>
      <p className="max-w-xs text-sm text-ink-soft">
        L’écran s’est dégommé tout seul. Recharge pour reprendre — rien n’est perdu.
      </p>
      <button type="button" className="cta" style={{ maxWidth: '16rem' }} onClick={() => window.location.reload()}>
        Recharger
      </button>
    </main>
  )
}
```

Use exactly this French copy. Tailwind color utilities `text-ink` /
`text-ink-soft` exist via the `@theme inline` mapping in `globals.css:75+`
(`--color-ink`, `--color-ink-soft`); if they do not resolve, fall back to
`style={{ color: 'var(--ink)' }}` / `var(--ink-soft)`.

Then create three identical thin boundaries (each file, same content):

- `apps/web/src/app/(tabs)/error.tsx`
- `apps/web/src/app/partie/[gameId]/error.tsx`
- `apps/web/src/app/lobby/[gameId]/error.tsx`

```tsx
'use client'

import { CrashScreen } from '@/components/error/crash-screen'

export default function SegmentError({ error }: { error: Error & { digest?: string } }) {
  return <CrashScreen error={error} />
}
```

(`reset` is intentionally unused — full reload is the recovery path.)

**Verify**: `pnpm --filter @degommix/web typecheck && pnpm --filter @degommix/web lint` → exit 0. If lint flags the unused `reset`, it is already omitted from the signature above — keep it omitted.

### Step 6: Create `global-error.tsx` with inline parchment styling

Create `apps/web/src/app/global-error.tsx`. It replaces the root layout when
active, so it MUST render `<html>` and `<body>`, and it cannot rely on
`globals.css`, Cinzel, or `ThemeScript`. Inline a small `<style>` using the
token values from the Current state table, with a `prefers-color-scheme: dark`
block (no `data-theme` handling here — ThemeScript is gone with the root
layout; system theme is an acceptable approximation on this screen).

```tsx
'use client'

import { useEffect } from 'react'
import { reportClientError } from '@/lib/client-error-reporter'

const STYLES = `
  :root { --parchment: #ece0c4; --ink: #251a10; --ink-soft: #6d5a3f; --bronze: #8c5a2b; --surface-2: #fbf6e9; }
  @media (prefers-color-scheme: dark) {
    :root { --parchment: #1c150d; --ink: #f1e3c2; --ink-soft: #cbb98c; --bronze: #d79a4b; --surface-2: #2b2115; }
  }
  body { margin: 0; background: var(--parchment); color: var(--ink); font-family: 'Times New Roman', Georgia, serif; }
  main { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1rem; padding: 0 1.5rem; text-align: center; }
  h1 { font-size: 1.25rem; text-transform: uppercase; letter-spacing: 0.03em; }
  p { max-width: 20rem; font-size: 0.9rem; color: var(--ink-soft); }
  button { font: inherit; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; background: var(--bronze); color: var(--surface-2); border: 2px solid var(--ink); border-radius: 14px; padding: 0.8rem 1.5rem; cursor: pointer; box-shadow: 0 5px 0 var(--ink); }
  button:active { transform: translateY(5px); box-shadow: none; }
`

/**
 * Last-resort crash floor: replaces the root layout, so it must ship its own
 * <html>/<body> and inline styling (globals.css is not loaded here). Only
 * rendered in production builds — next dev shows the overlay instead.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    reportClientError(error, window.location.pathname, navigator.userAgent)
  }, [error])

  return (
    <html lang="fr">
      <body>
        <style>{STYLES}</style>
        <main>
          <h1>Par Toutatis, un pépin !</h1>
          <p>L’écran s’est dégommé tout seul. Recharge pour reprendre — rien n’est perdu.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Recharger
          </button>
        </main>
      </body>
    </html>
  )
}
```

Escape hatch: if reproducing the parchment look inline fights you (e.g. lint
or hydration complaints about the `<style>` tag), ship a minimal neutral
fallback (plain background, readable text, working Recharger button) rather
than importing `globals.css` — do NOT import global CSS here.

**Verify**: `pnpm --filter @degommix/web typecheck && pnpm --filter @degommix/web lint` → exit 0.

### Step 7: Add the gated dev crash trigger

Create `apps/web/src/app/dev/crash/page.tsx`, gated exactly like
`apps/web/src/app/dev/ui/page.tsx:11-13`. Because `/dev/crash` sits under no
segment boundary, its throw is caught by `global-error.tsx` — which is
otherwise hard to exercise.

```tsx
import { notFound } from 'next/navigation'

/** Dev-only crash trigger: exercises global-error.tsx (no segment boundary above). */
export default function DevCrashPage() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_UI !== '1') {
    notFound()
  }
  throw new Error('Dev crash trigger (plans/020)')
}
```

**Verify**: `pnpm --filter @degommix/web typecheck` → exit 0.

### Step 8: Full-build verification and manual crash checks

1. `pnpm typecheck && pnpm lint && pnpm test` → all exit 0.
2. `pnpm --filter @degommix/web build` → exit 0.
3. Segment boundary check (dev server is fine for `error.tsx`):
   temporarily add `throw new Error('boundary check')` as the first statement
   of the component in `apps/web/src/app/(tabs)/classement/page.tsx`, run
   `pnpm --filter @degommix/web dev`, log in, open `/classement` → the crash
   screen appears (in dev, close the Next overlay to see it) with the copy
   « Par Toutatis, un pépin ! » and a « Recharger » button. Then REVERT with
   `git checkout -- "apps/web/src/app/(tabs)/classement/page.tsx"` and confirm
   `git status` no longer lists that file.
4. Reporter check: while crashed and logged in, the dev-server terminal prints
   one line containing `"scope":"client"` and `"level":"error"`.
5. Global boundary check (production build required):
   `ALLOW_DEV_UI=1 pnpm --filter @degommix/web start` after the build, open
   `/dev/crash` → the inline-styled global crash screen renders (parchment
   background, French copy, Recharger). Note the report POST answers 401 when
   not logged in — that is by design.
6. API check without a session:
   `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/client-error -H 'content-type: application/json' -d '{"message":"x","route":"/y"}'`
   → `401`.

**Verify**: every sub-check above matches its stated expectation; `git status`
shows only in-scope files.

## Test plan

New tests, co-located vitest, modeled after `apps/web/src/lib/ws-errors.test.ts`:

- `apps/web/src/lib/client-error.test.ts`
  - schema accepts a minimal valid report (`{message, route}`) and a full one.
  - schema rejects: empty `message`, missing `route`, `message` longer than
    500, `stack` longer than 4000, non-object body (`null`).
  - `formatClientErrorLine` output parses as JSON with exactly the keys
    `level: 'error'`, `scope: 'client'`, `userId`, `route`, `digest`,
    `userAgent`, `error`.
  - with a stack, `error` is `message + '\n' + stack`; without, `error` is the
    message alone.
- `apps/web/src/lib/client-error-reporter.test.ts`
  - sends exactly `MAX_REPORTS_PER_SESSION` (3) reports, then drops the 4th
    (mock `post` with `vi.fn()`).
  - a rejected `post` is swallowed (no unhandled rejection, next call still
    counted).
  - message/stack/route are truncated to `CLIENT_ERROR_LIMITS` before posting
    (inspect the JSON body given to the mock).
  - empty `error.message` falls back to `'Unknown client error'`.

Verification: `pnpm --filter @degommix/web test` → all pass, including the new
suites (existing count at commit `8890290` plus the new tests).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `find apps/web/src/app -name "error.tsx" | sort` prints exactly three
      paths: `(tabs)/error.tsx`, `lobby/[gameId]/error.tsx`,
      `partie/[gameId]/error.tsx`
- [ ] `test -f apps/web/src/app/global-error.tsx && test -f "apps/web/src/app/api/client-error/route.ts"` exits 0
- [ ] `pnpm typecheck && pnpm lint && pnpm test` all exit 0; the two new test
      files run and pass
- [ ] `pnpm --filter @degommix/web build` exits 0
- [ ] `grep -c '"level"' apps/web/src/lib/client-error.ts` ≥ 1 and
      `grep -n "scope: 'client'" apps/web/src/lib/client-error.ts` matches
      (log line matches the ws convention keys)
- [ ] `grep -rin "sentry\|@sentry" apps/web/package.json package.json` returns
      no matches (no SDK added)
- [ ] `git status --porcelain` lists only files from the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows changes in `apps/web/src/app`, `apps/web/src/lib` or
  `apps/web/src/components` and any "Current state" excerpt (session.ts gate,
  username route zod pattern, `.cta` in globals.css, ws-server log shape) no
  longer matches the live code.
- An `error.tsx` or `global-error.tsx` already exists when you start (someone
  landed a crash floor since `8890290`).
- The manual crash check in Step 8.3 does not render the boundary after one
  reasonable fix attempt (e.g. the throw landed in a layout instead of the
  page — layouts are not caught by their own segment's `error.tsx`).
- Tailwind `text-ink`/`text-ink-soft` classes fail AND the `var(--ink)` inline
  fallback also renders unstyled — the token system diverged from this plan.
- The fix appears to require touching `app/layout.tsx`, `globals.css`, or any
  other out-of-scope file.
- You discover the assumption "reload restores an active game via
  `game:state_snapshot`" is false (e.g. the handshake code at
  `apps/ws-server/src/server.ts:205` changed).

## Maintenance notes

- **Sentry (or any error SDK) is explicitly deferred**, not forgotten: the
  owner chose zero new dependencies for v1. If Sentry lands later, replace the
  body of `createClientErrorReporter`'s default transport and delete
  `/api/client-error` — the boundaries and copy stay.
- Unauthenticated crashes (on `/login`) are dropped by the session gate. If
  that blind spot starts to matter, the route needs its own abuse protection
  (real rate limiting) before opening up — out of scope here.
- Railway triage: filter web-service logs on `"scope":"client"`; the same
  `{level, scope, userId, error}` shape as the ws-server means one saved query
  covers both services. If the ws-server log shape ever changes, change
  `formatClientErrorLine` with it.
- The 3-reports-per-page-lifetime cap resets on reload; a crash-reload loop
  therefore still emits a line per reload. Acceptable at current scale — noted
  in case log volume ever spikes.
- Reviewer should scrutinize: that `global-error.tsx` imports nothing that
  pulls in `globals.css` transitively, that the French copy matches Step 5
  exactly, and that no `console.*` was added outside the API route.
- If the `(tabs)` layout itself (not its pages) ever throws, only
  `global-error.tsx` catches it — adding a root-level `app/error.tsx` is the
  follow-up if that becomes a real failure mode.
