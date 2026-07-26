import { fileURLToPath } from 'node:url'
import { getTableName, is, sql, type SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { PgDialect, PgTable } from 'drizzle-orm/pg-core'
import postgres from 'postgres'
import type { Db } from './client'
import * as schema from './schema/index'

const dialect = new PgDialect()

/**
 * Compiles a Drizzle `sql` fragment exactly the way the driver does, so a test
 * can assert on the **bound parameters** rather than on the SQL text.
 *
 * Why this exists: a value interpolated in a raw `sql` fragment bypasses the
 * column's encoder and is handed to postgres-js as-is. A `Date` reaching the
 * driver that way throws `ERR_INVALID_ARG_TYPE` at query time — invisible to
 * the type-checker, and only reproducible against a real database unless the
 * params are inspected. `params` here is the very array postgres-js receives.
 */
export function compileFragment(fragment: SQL): { sql: string; params: unknown[] } {
  const query = dialect.sqlToQuery(fragment)
  return { sql: query.sql, params: query.params }
}

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://degommix:degommix@localhost:54329/degommix_test'

/**
 * Arbitrary key for the advisory lock guarding `migrateTestDb`. Suites in different
 * packages migrate the same database concurrently (`turbo run test` runs packages in
 * parallel), and two migrators racing on a fresh database collide on
 * `CREATE SCHEMA IF NOT EXISTS "drizzle"` (unique violation on pg_namespace).
 */
const MIGRATION_LOCK_KEY = 4_814_202_501

/** Applies all SQL migrations from packages/db/drizzle to the test database. */
export async function migrateTestDb(): Promise<void> {
  const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))
  const client = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} })
  try {
    await client`SELECT pg_advisory_lock(${MIGRATION_LOCK_KEY})`
    try {
      await migrate(drizzle(client), { migrationsFolder })
    } finally {
      await client`SELECT pg_advisory_unlock(${MIGRATION_LOCK_KEY})`
    }
  } finally {
    await client.end()
  }
}

/** Every table declared in the Drizzle schema, quoted for use in a TRUNCATE statement. */
const APPLICATION_TABLES = (Object.values(schema) as unknown[])
  .filter((exported): exported is PgTable => is(exported, PgTable))
  .map((table) => `"public"."${getTableName(table)}"`)

/**
 * Truncates every application table (migration bookkeeping lives in the `drizzle` schema).
 *
 * The table list comes from the Drizzle schema rather than from `pg_tables`: several suites
 * share the test database, and enumerating `public` also picked up scratch tables owned by
 * another suite — truncating (or failing on) the collation probe of `schema/friends.test.ts`
 * mid-flight. The schema stays exhaustive because migrations are generated from it
 * (`pnpm db:generate`), so no application table can exist without being declared here.
 */
export async function truncateAll(db: Db): Promise<void> {
  if (APPLICATION_TABLES.length === 0) return
  await db.execute(
    sql.raw(`TRUNCATE TABLE ${APPLICATION_TABLES.join(', ')} RESTART IDENTITY CASCADE`)
  )
}

/** Inserts a minimal user row for integration tests. */
export async function createTestUser(
  db: Db,
  { id, username }: { id: string; username: string }
): Promise<void> {
  await db.insert(schema.user).values({
    id,
    name: username,
    email: `${id}@test.local`,
    username,
  })
}
