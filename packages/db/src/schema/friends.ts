import { check, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { user } from './auth'

export const friendRequestStatus = pgEnum('friend_request_status', [
  'pending',
  'accepted',
  'declined',
  'canceled',
])

export const friendRequests = pgTable(
  'friend_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    senderId: text('sender_id')
      .notNull()
      .references(() => user.id),
    receiverId: text('receiver_id')
      .notNull()
      .references(() => user.id),
    status: friendRequestStatus('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('friend_requests_no_self', sql`${t.senderId} <> ${t.receiverId}`),
    uniqueIndex('friend_requests_pending_unique')
      .on(t.senderId, t.receiverId)
      .where(sql`${t.status} = 'pending'`),
  ]
)

export const friendships = pgTable(
  'friendships',
  {
    userLow: text('user_low')
      .notNull()
      .references(() => user.id),
    userHigh: text('user_high')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userLow, t.userHigh] }),
    // Forced to the "C" collation so the ordering matches `canonicalPair` (JS UTF-16 code
    // units) on every deployment. Without it the comparison uses the database collation:
    // a linguistic one (glibc en_US.UTF-8, ICU) orders 'm' before 'W' and rejects valid pairs.
    check(
      'friendships_canonical',
      sql`(${t.userLow} COLLATE "C") < (${t.userHigh} COLLATE "C")`
    ),
  ]
)

/**
 * Orders a user id pair into the (user_low, user_high) form stored in `friendships`.
 * Uses plain JS code-unit comparison, which the `friendships_canonical` CHECK mirrors
 * via `COLLATE "C"`. Every read and write of the table must go through this helper.
 */
export function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}
