import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.url(),
  NEXT_PUBLIC_WS_URL: z.url(),
})

export const env = schema.parse(process.env)
