export { createDb, type Db } from './client'
// Re-exported so consumers share this package's drizzle-orm instance (avoids pnpm peer-variant type clashes)
export { and, eq, or, sql } from 'drizzle-orm'
export * from './schema/index'
