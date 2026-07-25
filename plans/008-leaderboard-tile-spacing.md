# Plan 008: Give the leaderboard spotlight cards a real gap between their section title and their content

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat e772284..HEAD -- apps/web/src/components/stats/top-degommeur-tile.tsx apps/web/src/components/stats/rivalry-tile.tsx apps/web/src/components/stats/head-to-head-card.tsx`
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

> « Dans l'écran de classement, les cards plus grand dégommeur et rivalité, le
> titre devrait avoir un margin bottom où un meilleur gap entre titre de
> section ET contenu. »

On the Classement screen the two spotlight cards render their `sec-label`
title (« Plus grand dégommeur », « Rivalités ») directly against the row below
it, with **zero** vertical spacing — the `.sec-label` rule sets `margin: 0` and
neither card's `<Card>` establishes a gap. Inside a bordered, padded card that
collision reads as a rendering bug rather than a design choice. Every other
`sec-label` + content pairing in the app already uses a `flex flex-col gap-2`
container; these three cards are the outliers. Fixing them makes the Classement
screen internally consistent with the rest of the app and removes the visual
defect the owner flagged.

This is pure CSS-class polish: no props, no copy, no data, no behaviour change.

## Current state

### Files involved

- `apps/web/src/components/stats/top-degommeur-tile.tsx` — the « Plus grand
  dégommeur » spotlight card on `/classement`. Rendered from
  `apps/web/src/components/stats/leaderboard-screen.tsx:46`.
- `apps/web/src/components/stats/rivalry-tile.tsx` — the « Rivalités » spotlight
  card on `/classement`. Rendered from `leaderboard-screen.tsx:48`.
- `apps/web/src/components/stats/head-to-head-card.tsx` — the « Face à face »
  card on the friend profile screen `/amis/[userId]`. Rendered from
  `apps/web/src/app/(tabs)/amis/[userId]/page.tsx:74`. **Structurally identical
  to the two cards above** (`<Card className="px-4 py-3">` → `sec-label` →
  content) and therefore has the exact same defect. It is included in this plan
  so the app does not end up with two different spacings for the same card
  shape. See "Design decision" below.

### Excerpt — `apps/web/src/components/stats/top-degommeur-tile.tsx:12-29`

```tsx
  return (
    <Card className="px-4 py-3">
      <p className="sec-label">Plus grand dégommeur</p>
      <div className="flex items-center gap-3">
        <PlayerAvatar username={top.username} size={40} />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-sm font-bold">{top.username}</p>
          <p className="m-0 text-xs text-ink-soft">
            {top.degommages} pion{top.degommages > 1 ? 's' : ''} dégommé
            {top.degommages > 1 ? 's' : ''} au total
          </p>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-lg font-bold text-bronze">
          <Icon name="sword" size={18} />
          {top.degommages}
        </span>
      </div>
    </Card>
  )
```

### Excerpt — `apps/web/src/components/stats/rivalry-tile.tsx:26-29`

```tsx
  return (
    <Card className="px-4 py-3">
      <p className="sec-label">Rivalités</p>
      <div className="flex flex-col gap-3">
```

(The card's closing `</div></Card>` is at `rivalry-tile.tsx:58-59`. The inner
`flex flex-col gap-3` wrapper holds the « Ta bête noire » and « Ta victime
préférée » rows.)

### Excerpt — `apps/web/src/components/stats/head-to-head-card.tsx:15-22`

```tsx
  return (
    <Card className="px-4 py-3">
      <p className="sec-label">Face à face</p>
      {isEmpty ? (
        <p className="m-0 text-sm" style={{ color: 'var(--ink-soft)' }}>
          Aucun dégommage entre vous pour l’instant.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
```

### Why there is no gap today

`apps/web/src/app/globals.css:353-360`:

```css
.sec-label {
  margin: 0;
  font-size: 0.68rem;
  color: var(--ink-faint);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
}
```

`margin: 0` is deliberate — the class is used in ~20 places and the spacing is
always supplied by the **parent container**, never by the label. Do not change
this rule (see "Out of scope").

`apps/web/src/components/ui/card.tsx` is a thin wrapper that concatenates the
`.card` class with whatever `className` is passed:

```tsx
export function Card({ children, className }: CardProps) {
  return <div className={className ? `card ${className}` : 'card'}>{children}</div>
}
```

So the fix is entirely a matter of the `className` string passed to `<Card>`.
`.card` itself (`globals.css:133-138`) only sets background, border,
border-radius and padding — it is `display: block` by default, which is why the
label and the content stack flush.

### Repo convention this plan must match

The app's established idiom for a `sec-label` followed by its content is a
**flex column container with `gap-2`** (0.5rem). Verified exemplars — read at
least one before editing:

- `apps/web/src/components/live/live-journal.tsx:12` —
  `<section className="card relative z-10 flex flex-col gap-2 p-3">` then
  `<p className="sec-label">Journal de la partie</p>`. This is the closest
  precedent: a `.card` that is itself the flex column.
- `apps/web/src/components/home/home-screen.tsx:82-83` —
  `<section className="flex flex-col gap-2">` + `sec-label` « Historique récent ».
- `apps/web/src/components/lobby/host-controls.tsx:42-44` and `:51-53` —
  `<div className="flex flex-col gap-2">` + `sec-label` « Format » / « Inviter
  des amis ».
- `apps/web/src/components/lobby/play-screen.tsx:171-172` — same shape.
- `apps/web/src/app/(tabs)/parties/[gameId]/page.tsx:112-113` — same shape.
- `apps/web/src/app/(tabs)/profil/page.tsx:37-39` — proves `<Card>` already
  receives flex utilities in this repo:
  `<Card className="flex flex-col gap-3 p-4">`.

Design constraint from `SPECS.md` §"Design" — the UI is a port of
`docs/maquette.html`. Note that the maquette **also** renders the spotlight card
without a gap (`docs/maquette.html:632-638`), so the current code is a faithful
port; the owner's post-playtest feedback deliberately overrides the maquette on
this point. Do not "fix" the maquette file.

## Commands you will need

| Purpose   | Command                                        | Expected on success        |
|-----------|------------------------------------------------|----------------------------|
| Install   | `pnpm install`                                 | exit 0                     |
| Typecheck | `pnpm typecheck`                               | exit 0, no errors          |
| Lint      | `pnpm lint`                                    | exit 0                     |
| Unit tests| `pnpm test`                                    | exit 0 (no test covers these components; `--passWithNoTests` is configured) |
| Dev server| `pnpm --filter @degommix/web dev`              | serves http://localhost:3000 |

Run all commands from the repo root. Package manager is **pnpm 11.13.1**
(`package.json` → `packageManager`); the monorepo is driven by Turborepo.

## Design decision (already made — implement it, do not re-litigate)

**Chosen approach**: turn each `<Card>` into the flex column itself by adding
`flex flex-col gap-2` to its existing `className`.

Rejected alternatives and why:

- *Add `mb-2` to the `<p className="sec-label">`* — spreads spacing
  responsibility onto the label at three call sites while every other call site
  in the app leaves the label at `margin: 0`. Inconsistent.
- *Change `.sec-label` in `globals.css` to have a bottom margin* — it is used in
  ~20 places that already supply their own gap; this would double the spacing
  everywhere else. Explicitly forbidden by this plan.
- *Wrap the content in an extra `<div className="mt-2">`* — adds a DOM node for
  nothing; `gap-2` on the existing container is fewer moving parts.

`gap-2` = `0.5rem`, matching every exemplar listed above. Do not use `gap-1.5`,
`gap-3`, or an arbitrary value.

**Decision on `head-to-head-card.tsx`**: include it. The owner only named the
two Classement cards, but « Face à face » is the same component shape
(`<Card className="px-4 py-3">` + `sec-label` + content) shipped by the same
feature. Treating it identically costs one line and prevents the app from having
two different answers to the same layout question.

## Scope

**In scope** (the only files you should modify):

- `apps/web/src/components/stats/top-degommeur-tile.tsx`
- `apps/web/src/components/stats/rivalry-tile.tsx`
- `apps/web/src/components/stats/head-to-head-card.tsx`
- `plans/README.md` (status row only, at the very end)

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/app/globals.css` — the `.sec-label` and `.card` rules are shared
  by ~20 call sites; changing them here would silently re-space unrelated
  screens.
- `apps/web/src/components/ui/card.tsx` — `Card` must stay a dumb `className`
  passthrough; baking a flex layout into it would change every card in the app.
- `apps/web/src/components/stats/character-winrate-bars.tsx` and
  `apps/web/src/components/stats/game-journal.tsx` — these have the same
  zero-gap `sec-label` pattern but are **bare sections, not cards**, and the
  owner's feedback was about cards. Deferred on purpose; see "Maintenance
  notes".
- `apps/web/src/components/stats/ranking-table.tsx`,
  `apps/web/src/components/stats/leaderboard-screen.tsx` — no `sec-label`, no
  change needed. The `.tab-page` container already spaces the cards from each
  other with `gap: 1.1rem` (`globals.css:475-484`).
- `docs/maquette.html` — a frozen design reference, not shipped code.
- Any change to card padding (`px-4 py-3`), copy, icons, sizes or colours.

## Git workflow

- Branch: `fix/008-leaderboard-tile-spacing` (branch off `main`; the repo uses
  `type/short-description`, e.g. `fix/post-playtest-round-1`).
- One commit is enough for this plan. Conventional Commits, matching
  `git log --oneline` style in this repo (e.g.
  `fix(web): per-target tap lock on the degommage chips`):
  `fix(web): breathe the section titles of the spotlight cards`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the gap to the « Plus grand dégommeur » card

In `apps/web/src/components/stats/top-degommeur-tile.tsx`, change the single
`<Card>` opening tag.

Before (`top-degommeur-tile.tsx:13`):

```tsx
    <Card className="px-4 py-3">
```

After:

```tsx
    <Card className="flex flex-col gap-2 px-4 py-3">
```

Nothing else in the file changes.

**Verify**:
`grep -n 'flex flex-col gap-2 px-4 py-3' apps/web/src/components/stats/top-degommeur-tile.tsx`
→ exactly one match, on the `<Card` line.

### Step 2: Add the gap to the « Rivalités » card

In `apps/web/src/components/stats/rivalry-tile.tsx`, change the `<Card>` opening
tag the same way.

Before (`rivalry-tile.tsx:27`):

```tsx
    <Card className="px-4 py-3">
      <p className="sec-label">Rivalités</p>
      <div className="flex flex-col gap-3">
```

After:

```tsx
    <Card className="flex flex-col gap-2 px-4 py-3">
      <p className="sec-label">Rivalités</p>
      <div className="flex flex-col gap-3">
```

Leave the inner `flex flex-col gap-3` wrapper exactly as it is — it spaces the
two rivalry rows from each other, which is a different concern.

**Verify**:
`grep -n 'flex flex-col gap-2 px-4 py-3' apps/web/src/components/stats/rivalry-tile.tsx`
→ exactly one match, on the `<Card` line.

### Step 3: Add the gap to the « Face à face » card

In `apps/web/src/components/stats/head-to-head-card.tsx`, change the `<Card>`
opening tag the same way.

Before (`head-to-head-card.tsx:16`):

```tsx
    <Card className="px-4 py-3">
```

After:

```tsx
    <Card className="flex flex-col gap-2 px-4 py-3">
```

This card renders either a single `<p>` (empty state) or a
`flex flex-col gap-1.5` list; both are direct children of the `Card`, so the
`gap-2` applies correctly in both branches. Do not restructure the
`isEmpty` ternary.

**Verify**:
`grep -n 'flex flex-col gap-2 px-4 py-3' apps/web/src/components/stats/head-to-head-card.tsx`
→ exactly one match, on the `<Card` line.

### Step 4: Static verification

Run, from the repo root:

```
pnpm typecheck
pnpm lint
pnpm test
```

**Verify**: all three exit 0 with no errors.

### Step 5: Visual check (mandatory — this plan's whole point is visual)

1. Start the app: `pnpm --filter @degommix/web dev` (needs the usual local env;
   if the dev server cannot start because of missing env/DB, treat it as a STOP
   condition and report — do not skip this step silently).
2. Open http://localhost:3000/classement in a browser, sign in as an account
   that has at least one friend and at least one finished game (otherwise the
   screen shows the « Pas encore de cercle » empty state and neither card
   renders).
3. Set the viewport to **390 × 844** (the e2e reference viewport, see
   `e2e/playwright.config.ts` → `use.viewport`).
4. Take a screenshot of the Classement screen showing **both** the « Plus grand
   dégommeur » card and the « Rivalités » card in the same frame, in **light**
   theme. Attach it to your report.
5. Take the same screenshot in **dark** theme (the app has a theme switcher on
   `/profil`, or use the browser's `prefers-color-scheme` emulation).
6. Open a friend profile at `/amis/<friendId>` and screenshot the « Face à
   face » card.

**Verify** on each screenshot, by eye:

- There is a visible 8px band of card background between the baseline of the
  uppercase title and the top of the avatar/first row below it.
- The card's outer padding is unchanged: the title still starts at the same
  x-offset and the card is 8px taller than before, not repositioned.
- No horizontal shift, no clipped text, no change in the sword icon / counter
  alignment on the right edge of the « Plus grand dégommeur » row.

If the gap looks visually wrong at `gap-2`, STOP and report with the screenshot
rather than tuning the value yourself — the owner picks the final spacing.

### Step 6: Update the plan index

Add a row for plan 008 to the table in `plans/README.md` (Priority P3, Effort S,
Depends on —, Status DONE) unless a reviewer told you they maintain the index.

**Verify**: `grep -n '008' plans/README.md` → returns the new row.

## Test plan

No automated tests are added by this plan. Justification, so the executor does
not invent any:

- The change is three Tailwind class strings; there is no logic, no prop, no
  branch to assert.
- The repo has **no component-render tests** for `apps/web` — `pnpm test` in
  `apps/web` is `vitest run --passWithNoTests`, and the only web-side unit tests
  are pure-logic files (`apps/web/src/components/live/finish-guard.test.ts`,
  `apps/web/src/components/live/tap-lock.test.ts`). Adding a DOM-testing stack
  for a CSS class would be out of proportion and out of scope.
- The Playwright happy path (`e2e/happy-path.spec.ts`) never visits
  `/classement` cards by role/name, so it is unaffected. Do not add e2e steps.

Regression safety net = Step 4 (typecheck + lint + existing tests all green) and
Step 5 (screenshots).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm test` exits 0
- [ ] `grep -rn 'className="px-4 py-3"' apps/web/src/components/stats/` returns
      **no matches** (all three cards migrated)
- [ ] `grep -rln 'flex flex-col gap-2 px-4 py-3' apps/web/src/components/stats/`
      returns exactly these three files: `top-degommeur-tile.tsx`,
      `rivalry-tile.tsx`, `head-to-head-card.tsx`
- [ ] `git diff --name-only` lists only the three component files (plus
      `plans/README.md`) — no other file modified
- [ ] `git diff --stat` shows 3 changed lines in the components (1 per file)
- [ ] Step 5 screenshots taken and attached to the report (light + dark
      Classement, plus the friend-profile card)
- [ ] `plans/README.md` status row for 008 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `<Card className="px-4 py-3">` line is not present in one of the three
  files, or the surrounding JSX does not match the "Current state" excerpts —
  the codebase drifted since this plan was written.
- `.sec-label` in `apps/web/src/app/globals.css` no longer reads `margin: 0`, or
  `.card` has gained a `display: flex` — the premise of the fix would be stale
  and the gap could end up doubled.
- `pnpm typecheck` or `pnpm lint` fails after the change (they should be
  completely unaffected — a failure means something unrelated is broken, or the
  edit was malformed).
- You cannot start the dev server / cannot reach a Classement screen that
  renders both cards, so Step 5 is impossible. Report what blocked you; do not
  mark the plan done on static checks alone.
- `gap-2` visibly over- or under-shoots and you are tempted to pick a different
  value — report the screenshot and let the owner choose.
- The fix appears to require touching `globals.css` or `card.tsx`.

## Maintenance notes

For the human/agent who owns this code after the change lands:

- **What a reviewer should scrutinise**: that the diff is exactly three
  `className` strings and nothing else; that `gap-2` (not `gap-3`) was used, to
  stay aligned with the `sec-label` idiom used everywhere else; and that the
  screenshots show the two Classement cards in the same frame so their spacing
  can be compared side by side.
- **Deliberately deferred**: `character-winrate-bars.tsx:13-15` and
  `game-journal.tsx:12-14` have the identical zero-gap `sec-label` pattern, but
  as bare `<div>` sections rather than cards — the flush title reads far less
  like a bug outside a bordered box, and the owner's feedback named cards. If a
  future round of feedback flags them, the fix is the same one line
  (`<div className="flex flex-col gap-2">`), and `character-winrate-bars.tsx`
  sits directly below the two cards this plan fixes, so it is the most likely
  next complaint.
- **Future interaction**: any new card that pairs a `sec-label` with content
  should be written as `<Card className="flex flex-col gap-2 …">` from the
  start. If a shared `<SectionCard>` component is ever extracted, it should bake
  in this gap and these three call sites become its first consumers.
