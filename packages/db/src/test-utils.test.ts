import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb, type Db } from './client'
import { user } from './schema/index'
import { TEST_DATABASE_URL, createTestUser, migrateTestDb, truncateAll } from './test-utils'

describe('db test utilities (requires docker-compose.test.yml postgres)', () => {
  let db: Db

  beforeAll(async () => {
    await migrateTestDb()
    db = createDb(TEST_DATABASE_URL)
    await truncateAll(db)
  })

  afterAll(async () => {
    await db.$client.end()
  })

  it('applies migrations and round-trips a user row', async () => {
    await createTestUser(db, { id: 'user-1', username: 'Panoramix' })

    const rows = await db.select().from(user)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: 'user-1',
      name: 'Panoramix',
      username: 'Panoramix',
      email: 'user-1@test.local',
      emailVerified: false,
    })
  })

  it('truncateAll empties every application table', async () => {
    await truncateAll(db)

    const [count] = await db.execute<{ count: string }>(sql`SELECT count(*)::text AS count FROM "user"`)
    expect(count?.count).toBe('0')
  })
})
