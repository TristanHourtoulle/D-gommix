import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import type { Db } from './client'
import { user } from './schema/index'

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://degommix:degommix@localhost:54329/degommix_test'

/** Applies all SQL migrations from packages/db/drizzle to the test database. */
export async function migrateTestDb(): Promise<void> {
  const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))
  const client = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} })
  try {
    await migrate(drizzle(client), { migrationsFolder })
  } finally {
    await client.end()
  }
}

/** Truncates every application table (migration bookkeeping lives in the `drizzle` schema). */
export async function truncateAll(db: Db): Promise<void> {
  const rows = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  )
  if (rows.length === 0) return
  const tables = rows.map((r) => `"public"."${r.tablename}"`).join(', ')
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`))
}

/** Inserts a minimal user row for integration tests. */
export async function createTestUser(
  db: Db,
  { id, username }: { id: string; username: string }
): Promise<void> {
  await db.insert(user).values({
    id,
    name: username,
    email: `${id}@test.local`,
    username,
  })
}
