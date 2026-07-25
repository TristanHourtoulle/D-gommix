import type { ZodType } from 'zod'
import type { Ack, ErrorCode } from '@degommix/game-core'

/** Thrown inside handlers to answer with a specific error code. */
export class CommandError extends Error {
  constructor(
    readonly code: ErrorCode,
    message?: string
  ) {
    super(message ?? code)
    this.name = 'CommandError'
  }
}

export type EmptyResult = Record<never, never>

export const OK: Ack<EmptyResult> = { ok: true }

export function failAck(
  code: ErrorCode,
  message?: string
): { ok: false; code: ErrorCode; message: string } {
  return { ok: false, code, message: message ?? code }
}

type AckCallback = (response: unknown) => void

/**
 * Wraps a socket handler: Zod-parses the payload, awaits the handler and maps
 * thrown errors onto the `{ ok: false, code }` ack convention.
 */
export function withAck<Payload, Result extends object>(
  schema: ZodType<Payload>,
  handler: (payload: Payload) => Promise<Ack<Result>>
): (payload: unknown, callback?: unknown) => void {
  return (payload, callback) => {
    const respond: AckCallback =
      typeof callback === 'function' ? (callback as AckCallback) : () => undefined
    const parsed = schema.safeParse(payload)
    if (!parsed.success) {
      respond(failAck('INTERNAL', 'invalid payload'))
      return
    }
    handler(parsed.data)
      .then((ack) => {
        respond(ack)
      })
      .catch((error: unknown) => {
        if (error instanceof CommandError) {
          respond(failAck(error.code, error.message))
          return
        }
        console.error(
          JSON.stringify({
            level: 'error',
            scope: 'ws-handler',
            error: error instanceof Error ? (error.stack ?? error.message) : String(error),
          })
        )
        respond(failAck('INTERNAL'))
      })
  }
}

/**
 * True when a Postgres error is a unique constraint violation (23505).
 * Walks the `cause` chain: drizzle-orm wraps driver errors in DrizzleQueryError.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    if ('code' in current && (current as { code: unknown }).code === '23505') return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}
