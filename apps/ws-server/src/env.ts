import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  JWKS_URL: z.url().optional(),
  PORT: z.coerce.number().int().positive().default(3001),
})

export interface Env {
  databaseUrl: string
  webOrigin: string
  jwksUrl: string
  port: number
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.parse(source)
  return {
    databaseUrl: parsed.DATABASE_URL,
    webOrigin: parsed.WEB_ORIGIN,
    jwksUrl: parsed.JWKS_URL ?? `${parsed.WEB_ORIGIN}/api/auth/jwks`,
    port: parsed.PORT,
  }
}
