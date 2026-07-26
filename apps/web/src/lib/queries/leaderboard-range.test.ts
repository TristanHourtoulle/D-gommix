import { describe, expect, it } from 'vitest'
import { and } from '@degommix/db'
import { compileFragment } from '@degommix/db/test-utils'
import { endedInWindow } from './leaderboard-range'

/**
 * Regression guard for the `/api/leaderboard?period=month` 500: the bounds are
 * interpolated in a RAW `sql` fragment, which bypasses the timestamp column's
 * encoder. A `Date` therefore reaches postgres-js unmapped and it throws
 * `ERR_INVALID_ARG_TYPE` (« "string" argument … Received an instance of Date »).
 * Asserting on the compiled *parameters* is what catches it: the SQL text is
 * identical either way, and TypeScript is happy either way.
 */
describe('endedInWindow', () => {
  const from = new Date('2026-06-30T22:00:00.000Z')
  const to = new Date('2026-07-31T22:00:00.000Z')

  const paramsOf = (fragments: ReturnType<typeof endedInWindow>): unknown[] => {
    const combined = and(...fragments)
    return combined === undefined ? [] : compileFragment(combined).params
  }

  it('binds a closed month window as ISO strings, never Date instances', () => {
    const params = paramsOf(endedInWindow({ from, to }))
    expect(params).toEqual(['2026-06-30T22:00:00.000Z', '2026-07-31T22:00:00.000Z'])
    for (const param of params) {
      expect(param).toBeTypeOf('string')
      expect(param).not.toBeInstanceOf(Date)
    }
  })

  it('binds the month-to-date lower bound as an ISO string', () => {
    const fragments = endedInWindow({ from })
    expect(fragments).toHaveLength(1)
    expect(paramsOf(fragments)).toEqual(['2026-06-30T22:00:00.000Z'])
  })

  it('binds the upper bound alone as an ISO string', () => {
    const fragments = endedInWindow({ to })
    expect(fragments).toHaveLength(1)
    expect(paramsOf(fragments)).toEqual(['2026-07-31T22:00:00.000Z'])
  })

  it('produces no predicate at all for an all-time range', () => {
    expect(endedInWindow({})).toEqual([])
  })

  it('compares against ended_at with the >= / < bounds the window promises', () => {
    const combined = and(...endedInWindow({ from, to }))
    expect(combined).toBeDefined()
    const { sql: text } = compileFragment(combined!)
    expect(text).toContain('"games"."ended_at" >= $1')
    expect(text).toContain('"games"."ended_at" < $2')
  })
})
