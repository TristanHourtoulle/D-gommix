# Plan 009: Lift the live-screen action keys off the bottom edge, safe-area included

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat e772284..HEAD -- apps/web/src/components/live/live-screen.tsx apps/web/src/app/globals.css`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction (UI polish)
- **Planned at**: commit `e772284`, 2026-07-25

## Why this matters

Owner feedback after a playtest, verbatim (French):

> « Quand une partie est lancée, on a deux ou trois boutons en bas de l'écran,
> il faudrait ajouter du margin bottom afin qu'ils soient moins collés en bas de
> l'écran. »

`/partie/[gameId]` is a **fullscreen route deliberately outside the `(tabs)`
group** — no tab bar is rendered during a game
(`apps/web/src/app/partie/[gameId]/layout.tsx:7-12`, and `SPECS.md` line 143:
« Masquée pendant une partie en cours (écran live plein écran) »). The tab-bar
layout is also the only place in the app that reserves the home-indicator strip
(`.tabs-content` / `.tabbar-zone` in `globals.css`, the repo's only two uses of
`env(safe-area-inset-bottom)`). The live screen inherits none of that: its
action keys sit `mt-auto` at the bottom of a `min-h-dvh` column whose only
bottom breathing room is `py-5` (1.25rem / 20px).

On a phone with a home indicator that 20px is partly eaten by the system inset,
so « Annuler la dernière action » and « Fin de partie » — the two keys players
hammer during a real game — land flush against the bottom edge, hard to hit and
easy to mis-tap. Adding a fixed gap **plus** the device safe-area inset fixes it
on notched and non-notched devices alike.

## Current state

### Files involved

- `apps/web/src/components/live/live-screen.tsx` — the whole live screen
  (design §5.2 Live + Résumé). Its bottom action zone is the target.
- `apps/web/src/app/globals.css` — holds the app's design-system classes and the
  **only** existing `env(safe-area-inset-bottom)` handling in the repo. The new
  rule belongs here (see "Design decision").
- `apps/web/src/app/partie/[gameId]/layout.tsx` — read-only context: proves the
  route is outside `(tabs)` and therefore has no `.tabs-content` padding.

### Excerpt — the screen shell, `live-screen.tsx:124-126`

```tsx
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-5">
      <PawnField />
```

`py-5` = `1.25rem` top **and** bottom. `min-h-dvh` + `mt-auto` on the action
zone is what pins the keys to the bottom of the viewport.

### Excerpt — the bottom action zone, `live-screen.tsx:185-200` (the target)

```tsx
      <div className="relative z-10 mt-auto flex flex-col gap-2">
        <Button
          variant="ghost"
          disabled={!canUndo}
          onClick={() => {
            void run(game.undo())
          }}
        >
          <Icon name="undo" size={16} />
          Annuler la dernière action
        </Button>
        <Button disabled={!canAct || pending !== null} onClick={() => setEndSheetOpen(true)}>
          <Icon name="flag" size={16} />
          Fin de partie
        </Button>
      </div>
```

### The states the owner saw — « deux ou trois boutons »

Enumerated by reading the component. The bottom zone at `live-screen.tsx:185`
**always renders exactly two `<Button>`s**; the possible third button is a
sibling higher in the same column:

| State | Condition in the code | Buttons visible in the lower half |
|---|---|---|
| Normal play, viewer alive | `state.status !== 'finished'`, `canAct === true` (`:114`), `pending === null` | 2 — « Annuler la dernière action » (enabled iff `canUndo`, `:115`) + « Fin de partie » |
| Viewer eliminated | `canAct === false` → `TapZone` not rendered (`:150-160`) | 2 — both keys still rendered, both disabled |
| An end request is pending, **raised by the viewer** | `pending !== null && pending.requesterId === viewerId` (`:170`) | 3 — the pending `<section>` at `:162-181` adds « Retirer la demande » above `<LiveJournal>`, and both bottom keys stay (« Fin de partie » disabled by `pending !== null`) |
| An end request is pending, raised by someone else, viewer is host | `:212-220` | 2 + the `HostDecisionModal` overlay (a `role="dialog"`, not part of the column) |
| Game finished | `state.status === 'finished'` (`:99`) | Renders `<Summary>` instead — a different component, **out of scope** |

So the fix targets the `:185` container. The third button (« Retirer la demande
») lives inside the bordered pending card and is not flush against the screen
edge — it needs nothing.

### The pending card, for reference — `live-screen.tsx:162-181`

```tsx
      {pending ? (
        <section
          className="card relative z-10 flex flex-col gap-2 p-3"
          style={{ borderColor: 'var(--bronze)' }}
        >
          <p className="m-0 text-xs font-semibold">
            {describeEndRequest(pending, names)} — en attente de la décision de l’hôte.
          </p>
          {pending.requesterId === viewerId ? (
            <Button variant="ghost" onClick={/* … */}>
              Retirer la demande
            </Button>
          ) : null}
        </section>
      ) : null}
```

### The repo's safe-area idiom — `apps/web/src/app/globals.css:501-515`

These are the **only** two `env(safe-area-inset-bottom)` occurrences in the
whole repo (verified with `grep -rn 'safe-area' apps/web/src`):

```css
/* ---------- Liquid glass tab bar ---------- */

.tabs-content { padding-bottom: calc(5.5rem + env(safe-area-inset-bottom)); }

.tabbar-zone {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(0.75rem + env(safe-area-inset-bottom));
  display: flex;
  justify-content: center;
  padding: 0 1rem;
  z-index: 50;
  pointer-events: none;
}
```

Both follow the exact shape this plan reuses: `calc(<fixed rem> + env(safe-area-inset-bottom))`,
declared as a named class in `globals.css`, never inline in a component.

### The buttons themselves — `.cta`, `globals.css:147-172`

Relevant detail: `.cta` already reserves its arcade "key lip" with
`margin-bottom: var(--key-depth)` (`--key-depth: 5px`, `globals.css:24`). So the
last button already has 5px below it. The new padding stacks on top of that;
factor it in when judging the visual result, and do **not** remove or alter the
key-lip margin.

`apps/web/src/components/ui/button.tsx` renders `<button className="cta …">`
with the children inline — the accessible name is the button's text content
(« Annuler la dernière action », « Fin de partie »).

### E2E selectors that must keep working

`e2e/happy-path.spec.ts` drives both keys by accessible name:

- `e2e/happy-path.spec.ts:102` —
  `await p2.getByRole('button', { name: 'Annuler la dernière action' }).click()`
- `e2e/happy-path.spec.ts:109` —
  `await p2.getByRole('button', { name: 'Fin de partie' }).click()`
- `e2e/happy-path.spec.ts:113` — `getByRole('dialog', { name: 'Fin de partie' })`
  (the end sheet, unrelated to the container)

These match on **role + text**, not on classes or layout, so a padding change
cannot break them — provided you do not touch the button markup, text, or
`disabled` logic. The e2e viewport is `390 × 844`
(`e2e/playwright.config.ts` → `use.viewport`), a desktop Chromium with **no**
safe-area inset, i.e. `env(safe-area-inset-bottom)` resolves to `0px` there.

## Commands you will need

| Purpose   | Command                                        | Expected on success        |
|-----------|------------------------------------------------|----------------------------|
| Install   | `pnpm install`                                 | exit 0                     |
| Typecheck | `pnpm typecheck`                               | exit 0, no errors          |
| Lint      | `pnpm lint`                                    | exit 0                     |
| Unit tests| `pnpm test`                                    | exit 0                     |
| Dev server| `pnpm --filter @degommix/web dev`              | serves http://localhost:3000 |
| E2E       | `docker compose -f docker-compose.test.yml up -d` then `pnpm test:e2e` | the happy-path spec passes |

Run everything from the repo root. Package manager is **pnpm 11.13.1**; the
monorepo is driven by Turborepo. The e2e suite boots its own web + ws servers
(`e2e/playwright.config.ts` → `webServer`) and needs the test Postgres from
`docker-compose.test.yml` on port `54329`.

## Design decision (already made — implement it, do not re-litigate)

**Chosen approach**: add one named class to `globals.css`, in a new
"Live screen" section placed just before the tab-bar section, and apply it to
the `live-screen.tsx:185` action container.

```css
/* ---------- Fullscreen live screen ---------- */

/**
 * Bottom action keys of `/partie/[gameId]`. That route sits outside the `(tabs)`
 * group, so nothing reserves the home-indicator strip for it the way
 * `.tabs-content` does for the tabbed screens — the keys would otherwise land
 * flush on the bottom edge. The fixed 0.75rem stacks on the shell's own
 * `py-5` (1.25rem) for 2rem of breathing room on devices with no inset.
 */
.live-actions { padding-bottom: calc(0.75rem + env(safe-area-inset-bottom)); }
```

Why this and not the alternatives:

- *Tailwind arbitrary value on the component*
  (`pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]`) — Tailwind v4 supports it,
  but it needs underscore-escaped spaces to stay valid CSS (`1.25rem+env(…)`
  without whitespace around `+` is **invalid** in `calc()`), it is unreadable,
  and it contradicts the repo's existing choice to keep both safe-area rules in
  `globals.css`. Rejected.
- *Bumping the shell's `py-5` to `pb-8`* — changes the top padding relationship
  and still ignores the device inset. Rejected.
- *`margin-bottom` instead of `padding-bottom`* — the container is the last flex
  child of a `min-h-dvh` column; padding is what `.tabs-content` uses for the
  same job, so padding it is. Rejected for consistency, not correctness.
- *A fixed/sticky action bar* — a layout redesign, far beyond « ajouter du
  margin bottom ». Rejected.

Value rationale: `0.75rem` matches `.tabbar-zone`'s own fixed component
(`bottom: calc(0.75rem + env(...))`), so the live keys end up floating at the
same distance from the edge as the tab bar does on the tabbed screens. Total
clearance on a device with no inset: `0.75rem` (new) + `1.25rem` (`py-5`) +
`5px` (`--key-depth` lip) ≈ **37px**; on an iPhone with a ~34px inset, ≈ 71px.

## Scope

**In scope** (the only files you should modify):

- `apps/web/src/app/globals.css` — add the new `.live-actions` rule (additive
  only; do not modify any existing rule)
- `apps/web/src/components/live/live-screen.tsx` — add the class to one
  `className` string
- `plans/README.md` (status row only, at the very end)

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/components/ui/button.tsx` and the `.cta` rules in `globals.css`
  — **do not change button sizes, padding, variants or the `--key-depth` key
  lip**, explicitly forbidden by the owner's feedback ("juste du margin
  bottom").
- The button **copy** — « Annuler la dernière action » and « Fin de partie »
  must stay byte-for-byte identical; `e2e/happy-path.spec.ts:102` and `:109`
  match on those exact strings.
- The `disabled` expressions `!canUndo` / `!canAct || pending !== null`
  (`live-screen.tsx:188`, `:196`) — behaviour, not spacing.
- `apps/web/src/components/live/summary.tsx` — the finished-game screen has a
  structurally identical `<div className="mt-auto flex flex-col gap-2">` at
  `summary.tsx:114` with « Voir le classement » + « Rejouer », and the same
  missing inset. The owner's feedback was scoped to « quand une partie est
  lancée », so it is deliberately deferred; see "Maintenance notes".
- `apps/web/src/components/live/end-request-sheet.tsx`,
  `host-decision-modal.tsx` — overlays/dialogs, not part of the column.
- The pending-request `<section>` at `live-screen.tsx:162-181` — its « Retirer
  la demande » key is inside a bordered card, not against the screen edge.
- `.tabs-content` / `.tabbar-zone` — the tabbed screens are already correct.
- `e2e/happy-path.spec.ts` — no test change is needed.

## Git workflow

- Branch: `fix/009-live-actions-bottom-margin` (branch off `main`; the repo uses
  `type/short-description`, e.g. `fix/post-playtest-round-1`).
- One commit is enough. Conventional Commits, matching this repo's
  `git log --oneline` style (e.g.
  `fix(web): per-target tap lock on the degommage chips`):
  `fix(web): safe-area breathing room under the live action keys`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the `.live-actions` rule to `globals.css`

Open `apps/web/src/app/globals.css` and insert a new section **immediately
before** the existing tab-bar section header at line 501.

Before (`globals.css:499-503`):

```css
}

/* ---------- Liquid glass tab bar ---------- */

.tabs-content { padding-bottom: calc(5.5rem + env(safe-area-inset-bottom)); }
```

After:

```css
}

/* ---------- Fullscreen live screen ---------- */

/**
 * Bottom action keys of `/partie/[gameId]`. That route sits outside the `(tabs)`
 * group, so nothing reserves the home-indicator strip for it the way
 * `.tabs-content` does for the tabbed screens — the keys would otherwise land
 * flush on the bottom edge. The fixed 0.75rem stacks on the shell's own
 * `py-5` (1.25rem) for 2rem of breathing room on devices with no inset.
 */
.live-actions { padding-bottom: calc(0.75rem + env(safe-area-inset-bottom)); }

/* ---------- Liquid glass tab bar ---------- */

.tabs-content { padding-bottom: calc(5.5rem + env(safe-area-inset-bottom)); }
```

Do not reformat or move any existing rule. Note the whitespace around `+` inside
`calc()` — it is required by the CSS spec.

**Verify**:
`grep -n 'live-actions' apps/web/src/app/globals.css`
→ exactly one match.

`grep -c 'safe-area-inset-bottom' apps/web/src/app/globals.css`
→ `3` (was 2).

### Step 2: Apply the class to the live-screen action container

In `apps/web/src/components/live/live-screen.tsx`, change **only** the opening
`<div>` of the bottom action zone.

Before (`live-screen.tsx:185`):

```tsx
      <div className="relative z-10 mt-auto flex flex-col gap-2">
```

After:

```tsx
      <div className="live-actions relative z-10 mt-auto flex flex-col gap-2">
```

Everything inside that `<div>` — both `<Button>`s, their icons, their `disabled`
expressions and their French labels — stays byte-for-byte identical.

**Verify**:

- `grep -n 'live-actions' apps/web/src/components/live/live-screen.tsx`
  → exactly one match, on the container line.
- `grep -c 'Annuler la dernière action' apps/web/src/components/live/live-screen.tsx`
  → `1` (unchanged).
- `grep -c 'Fin de partie' apps/web/src/components/live/live-screen.tsx`
  → `1` (unchanged).
- `git diff --stat apps/web/src/components/live/live-screen.tsx`
  → `1 insertion(+), 1 deletion(-)`.

### Step 3: Static verification

From the repo root:

```
pnpm typecheck
pnpm lint
pnpm test
```

**Verify**: all three exit 0 with no errors.

### Step 4: Visual check (mandatory — this plan's whole point is visual)

1. Start the app: `pnpm --filter @degommix/web dev`. If it cannot start for
   env/DB reasons, that is a STOP condition — report it, do not skip.
2. Get into a running game (`/partie/<gameId>` with `status !== 'finished'`).
   The quickest route is two browser profiles: create a lobby, join with the
   second account, start the game.
3. Set the viewport to **390 × 844** to match the e2e reference viewport.
4. Screenshot the live screen showing the two bottom keys and the bottom edge of
   the viewport, in **light** theme, then again in **dark** theme. Attach both.
5. In devtools, emulate a device with a bottom safe-area inset (e.g. iPhone 14
   Pro with the "device frame"/`env()` emulation, or temporarily override the
   rule in the devtools style panel to
   `padding-bottom: calc(0.75rem + 34px)` — a devtools-only override, never a
   file edit). Screenshot that too.
6. Also screenshot the **pending-request state** (raise an end request from the
   non-host client so « Retirer la demande » is visible) to confirm the
   three-button layout still looks balanced.

**Verify** on the screenshots, by eye:

- A clear band of background sits under « Fin de partie » — roughly the same
  visual distance from the bottom edge as the tab bar has on `/accueil`, which
  you can compare directly by screenshotting a tabbed screen at the same
  viewport.
- The keys did **not** change size, font, colour or spacing between each other
  (`gap-2` between the two keys is unchanged).
- The arcade press animation still lands correctly: press and hold « Annuler la
  dernière action » and confirm the key still translates down onto its lip
  without the container shifting.
- Nothing above the action zone moved: `GameClock`, the player grid, `TapZone`
  and `LiveJournal` are all in the same place (the shell is `min-h-dvh` with
  `mt-auto`, so extra bottom padding only lifts the keys).

### Step 5: E2E regression check

The happy path clicks both keys by accessible name. Run it to prove the
selectors still resolve:

```
docker compose -f docker-compose.test.yml up -d
pnpm test:e2e
```

**Verify**: the `two-player 1v1 happy path (design §7.3)` test passes, in
particular the steps at `e2e/happy-path.spec.ts:102` (« Annuler la dernière
action ») and `:109` (« Fin de partie »). Playwright auto-scrolls before
clicking, so the extra padding cannot make an element unreachable — a failure
here means something else broke.

If the e2e environment cannot be brought up locally (Docker unavailable, ports
busy), say so explicitly in your report and note that the selectors are
role+text based and untouched by the diff; do **not** silently claim the suite
passed.

### Step 6: Update the plan index

Add a row for plan 009 to the table in `plans/README.md` (Priority P3, Effort S,
Depends on —, Status DONE) unless a reviewer told you they maintain the index.

**Verify**: `grep -n '009' plans/README.md` → returns the new row.

## Test plan

No automated tests are added by this plan:

- The change is one CSS declaration plus one class name. There is no logic, prop
  or branch to assert.
- `apps/web` has **no component-render tests** — its `test` script is
  `vitest run --passWithNoTests`, and the only web-side unit tests are
  pure-logic (`apps/web/src/components/live/finish-guard.test.ts`,
  `apps/web/src/components/live/tap-lock.test.ts`). Neither touches layout.
- A `padding-bottom` is not meaningfully assertable in jsdom (no layout engine,
  and `env()` resolves to nothing), so a unit test would assert the class string
  and prove nothing.

The regression net is: Step 3 (typecheck + lint + existing unit tests),
Step 5 (the real Playwright happy path exercising both keys), and Step 4
(screenshots for the human).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0
- [ ] `grep -c 'safe-area-inset-bottom' apps/web/src/app/globals.css` returns `3`
- [ ] `grep -n 'live-actions' apps/web/src/components/live/live-screen.tsx`
      returns exactly one line, and it is the action-container `<div>`
- [ ] `git diff --stat` shows exactly 2 changed source files:
      `apps/web/src/app/globals.css` (rule added, no deletions inside existing
      rules) and `apps/web/src/components/live/live-screen.tsx`
      (`1 insertion(+), 1 deletion(-)`)
- [ ] `git diff apps/web/src/components/live/live-screen.tsx | grep '^[-+]' | grep -c 'Annuler\|Fin de partie'`
      returns `0` — no button copy touched
- [ ] `git diff apps/web/src/app/globals.css | grep -c '^-'` returns `1`
      (the `--- a/…` header only) — the CSS change is purely additive
- [ ] `pnpm test:e2e` passes (or the blocker is explicitly reported)
- [ ] Step 4 screenshots taken and attached (light, dark, inset-emulated,
      pending state)
- [ ] `plans/README.md` status row for 009 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `live-screen.tsx:185` is not `<div className="relative z-10 mt-auto flex flex-col gap-2">`,
  or the two `<Button>`s below it no longer match the "Current state" excerpt —
  the codebase drifted since this plan was written.
- The shell at `live-screen.tsx:125` no longer has `min-h-dvh … py-5`, or the
  action zone lost `mt-auto` — the spacing arithmetic in "Design decision" would
  be wrong and the value needs re-deriving.
- `globals.css` already contains a `.live-actions` rule, or a third
  `safe-area-inset-bottom` occurrence exists before you start — someone did part
  of this already.
- `pnpm test:e2e` fails at `e2e/happy-path.spec.ts:102` or `:109` — that would
  mean the button selectors broke, which this diff must not be able to cause.
  Report the full failure, do not "fix" it by editing the spec.
- The visual result over- or under-shoots and you are tempted to change
  `0.75rem` to another value — report the screenshot and let the owner choose
  the final number.
- The fix appears to require touching `button.tsx`, the `.cta` rules, or
  `summary.tsx`.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **What a reviewer should scrutinise**: that the CSS diff is purely additive
  (no existing rule reformatted), that `calc()` keeps the whitespace around `+`,
  that button copy and `disabled` logic are untouched, and that the screenshots
  include one with an emulated bottom inset — the no-inset desktop case is the
  one that would hide a mistake.
- **Deliberately deferred**: `apps/web/src/components/live/summary.tsx:114` has
  the same `mt-auto flex flex-col gap-2` bottom zone (« Voir le classement » +
  « Rejouer ») on the same fullscreen route, with the same missing safe-area
  inset. It is the screen players land on immediately after the one this plan
  fixes, so it is the most likely next complaint; the fix is literally adding
  `live-actions` to that one `className`. Left out because the owner scoped the
  feedback to a running game and this plan keeps its blast radius to that.
- **Future interaction**: if the live screen ever gains a fixed/sticky bottom
  bar, or if `/partie/[gameId]` is moved back under a layout that renders the
  tab bar, `.live-actions` must be revisited — it would then double up with
  `.tabs-content`'s own padding.
- **Reusability**: `.live-actions` is deliberately generic enough to be applied
  to any bottom action stack on a tab-bar-less fullscreen route. If a third such
  screen appears, reuse the class rather than adding a second rule.
