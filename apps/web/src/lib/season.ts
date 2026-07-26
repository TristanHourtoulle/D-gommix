/**
 * The Classement's Paris-month machinery now lives in `@degommix/game-core`
 * (plan 039): `apps/ws-server` needs the same month boundaries to award the
 * title seals, and it cannot import from `apps/web`. This module stays as the
 * `@/lib/season` entry point every web surface already imports.
 */
export {
  currentParisMonthKey,
  monthWindowParis,
  nextMonthKey,
  parisMonthKeyOf,
  parseMonthKey,
  previousMonthKey,
  startOfCurrentMonthParis,
  startOfMonthParis,
  toMonthKey,
  type MonthWindow,
  type YearMonth,
} from '@degommix/game-core'
