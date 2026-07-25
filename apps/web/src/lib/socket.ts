import { io } from 'socket.io-client'
import { z } from 'zod'
import type { Ack, Command } from '@degommix/game-core'
import type { AckEmitter, AppSocket, CommandMap, CommandName } from './realtime-types'

export const ACK_TIMEOUT_MS = 10_000
export const COMMAND_RETRY_TIMEOUT_MS = 3_000
export const COMMAND_RETRY_ATTEMPTS = 3

/** Sentinel message set on the synthetic failure ack produced by a local timeout. */
export const ACK_TIMEOUT_MESSAGE = 'ack timeout'

const tokenResponseSchema = z.object({ token: z.string().min(1) })

/** Fetches a fresh short-lived JWT from the Better Auth JWT plugin endpoint. */
async function fetchWsToken(): Promise<string> {
  const response = await fetch('/api/auth/token', { credentials: 'same-origin' })
  if (!response.ok) throw new Error(`token fetch failed (${response.status})`)
  return tokenResponseSchema.parse(await response.json()).token
}

let instance: AppSocket | null = null

/**
 * Lazily creates the app-wide socket singleton. The `auth` callback runs on
 * every (re)connection attempt, so a fresh token is used after each reconnect.
 */
export function getSocket(): AppSocket {
  if (instance) return instance
  const url = process.env.NEXT_PUBLIC_WS_URL
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('NEXT_PUBLIC_WS_URL is not configured')
  }
  instance = io(url, {
    auth: (setAuth) => {
      fetchWsToken()
        .then((token) => {
          setAuth({ token })
        })
        .catch(() => {
          // No usable token: hand over an empty auth object so the server
          // rejects the handshake and the reconnection backoff keeps going.
          setAuth({})
        })
    },
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  })
  return instance
}

/** Test/HMR escape hatch: drops the singleton so the next getSocket() reconnects. */
export function resetSocketForTesting(): void {
  instance?.disconnect()
  instance = null
}

/**
 * Synthetic failure ack used for local timeouts and disconnected sockets:
 * `ackErrorMessage` maps it to the « Action non transmise » toast.
 */
export function timeoutAck<T extends object>(): Ack<T> {
  return { ok: false, code: 'INTERNAL', message: ACK_TIMEOUT_MESSAGE }
}

/** True when a failed ack was produced locally because no ack arrived in time. */
export function isAckTimeout(ack: Ack<object>): boolean {
  return !ack.ok && ack.message === ACK_TIMEOUT_MESSAGE
}

/**
 * Emits a command and resolves with its ack, or with a synthetic
 * `{ ok: false, code: 'INTERNAL' }` ack after `timeoutMs` without response.
 *
 * `AppSocket` is accepted through a narrowing assertion: socket.io's mapped
 * `Parameters<EmitEvents[Ev]>` emit signature is not structurally comparable
 * to the plain generic `AckEmitter`, although both call identically.
 */
export function emitWithAck<K extends CommandName>(
  socket: AppSocket | AckEmitter,
  event: K,
  payload: CommandMap[K]['payload'],
  timeoutMs: number = ACK_TIMEOUT_MS
): Promise<Ack<CommandMap[K]['result']>> {
  const emitter = socket as AckEmitter
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(timeoutAck())
    }, timeoutMs)
    emitter.emit(event, payload, (response) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(response)
    })
  })
}

/**
 * Sends a game command with the short-retry policy of design §4.5: the same
 * `clientEventId` is re-emitted when no ack arrives within 3s, 3 attempts max
 * (~10s). The server is idempotent on `clientEventId`, so a retry of an
 * already-persisted tap acks with the existing seq without double-counting.
 */
export async function sendGameCommand(
  socket: AppSocket | AckEmitter,
  gameId: string,
  clientEventId: string,
  command: Command
): Promise<Ack<{ seq: number }>> {
  const payload = { gameId, clientEventId, command }
  for (let attempt = 0; attempt < COMMAND_RETRY_ATTEMPTS; attempt++) {
    const ack = await emitWithAck(socket, 'game:command', payload, COMMAND_RETRY_TIMEOUT_MS)
    if (!isAckTimeout(ack)) return ack
  }
  return timeoutAck()
}
