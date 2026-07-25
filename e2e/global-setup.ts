import { createDb } from '@degommix/db'
import { migrateTestDb, truncateAll } from '@degommix/db/test-utils'
import { DATABASE_URL } from './playwright.config'

/** Migrates the test database and starts every run from empty tables. */
export default async function globalSetup(): Promise<void> {
  await migrateTestDb()
  const db = createDb(DATABASE_URL)
  try {
    await truncateAll(db)
  } finally {
    await db.$client.end()
  }
}
