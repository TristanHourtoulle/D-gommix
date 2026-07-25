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
    check('friendships_canonical', sql`${t.userLow} < ${t.userHigh}`),
  ]
)
