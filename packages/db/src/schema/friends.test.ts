import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from '../client'
import { canonicalPair } from './friends'
import { TEST_DATABASE_URL, migrateTestDb } from '../test-utils'

/**
 * Pair taken from the production incident: JS orders 'W' (0x57) before 'm' (0x6D),
 * a linguistic collation orders 'm' before 'W'.
 */
const PROD_LOW = 'WRjAXqlHVwriMViJ29gwKrnv4xvkpD4q'
const PROD_HIGH = 'mdxq1pDqI7iB6m0fFb8Y6zEqtEFQocnT'

/** Linguistic collation standing in for the glibc en_US.UTF-8 used by Railway Postgres. */
const LINGUISTIC = 'en-x-icu'

describe('friendships canonical constraint (requires docker-compose.test.yml postgres)', () => {
  let db: Db

  beforeAll(async () => {
    await migrateTestDb()
    db = createDb(TEST_DATABASE_URL)
  })

  afterAll(async () => {
    await db.$client.end()
  })

  it('orders a pair by JS code units, not by locale', () => {
    expect(canonicalPair(PROD_HIGH, PROD_LOW)).toEqual([PROD_LOW, PROD_HIGH])
    expect(canonicalPair(PROD_LOW, PROD_HIGH)).toEqual([PROD_LOW, PROD_HIGH])
  })

  it('pins the comparison to the "C" collation', async () => {
    const [row] = await db.execute<{ def: string }>(
      sql`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = 'friendships'::regclass AND conname = 'friendships_canonical'`
    )
    expect(row?.def).toContain('COLLATE "C"')
  })

  it('accepts the canonical pair even when the database collation is linguistic', async () => {
    // The test image is glibc-based so its default collation is already linguistic, like
    // production. Replaying the live constraint on explicitly collated columns keeps this
    // guard meaningful even if the image or its locale ever changes.
    const [row] = await db.execute<{ def: string }>(
      sql`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = 'friendships'::regclass AND conname = 'friendships_canonical'`
    )
    const def = row?.def
    if (def === undefined) throw new Error('friendships_canonical constraint not found')

    // Sanity check: this collation is the one that ordered the production pair "backwards".
    const [ordering] = await db.execute<{ linguistic_lt: boolean }>(
      sql`SELECT (${PROD_LOW} COLLATE "en-x-icu") < (${PROD_HIGH} COLLATE "en-x-icu")
          AS linguistic_lt`
    )
    expect(ordering?.linguistic_lt).toBe(false)

    await db.execute(sql.raw(`DROP TABLE IF EXISTS canonical_collation_probe`))
    await db.execute(
      sql.raw(
        `CREATE TABLE canonical_collation_probe (
           user_low text COLLATE "${LINGUISTIC}" NOT NULL,
           user_high text COLLATE "${LINGUISTIC}" NOT NULL,
           CONSTRAINT canonical_collation_probe_check ${def}
         )`
      )
    )
    try {
      const [low, high] = canonicalPair(PROD_LOW, PROD_HIGH)
      await db.execute(
        sql`INSERT INTO canonical_collation_probe (user_low, user_high) VALUES (${low}, ${high})`
      )
      const [count] = await db.execute<{ count: string }>(
        sql`SELECT count(*)::text AS count FROM canonical_collation_probe`
      )
      expect(count?.count).toBe('1')
    } finally {
      await db.execute(sql.raw(`DROP TABLE IF EXISTS canonical_collation_probe`))
    }
  })
})
