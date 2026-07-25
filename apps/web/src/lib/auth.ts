import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { jwt } from 'better-auth/plugins'
import * as schema from '@degommix/db/schema'
import { db } from './db'
import { env } from './env'

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      username: { type: 'string', required: false, input: false },
    },
  },
  plugins: [
    jwt({
      jwt: {
        expirationTime: '15m',
        definePayload: ({ user }) => ({ username: user.username ?? null }),
      },
    }),
  ],
})
