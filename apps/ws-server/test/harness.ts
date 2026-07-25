import type { AddressInfo } from 'node:net'
import { generateKeyPair, jwtVerify, SignJWT } from 'jose'
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client'
import { createDb, type Db } from '@degommix/db'
import { createTestUser, TEST_DATABASE_URL, truncateAll } from '@degommix/db/test-utils'
import type { Ack } from '@degommix/game-core'
import { createWsServer, type WsServer, type WsServerDeps } from '../src/server'
import type { TimerApi } from '../src/host-transfer'

/** Deterministic replacement for setTimeout/clearTimeout, advanced manually. */
export class ManualTimers implements TimerApi {
  private tasks: { id: number; at: number; fn: () => void }[] = []
  private nextId = 1
  private nowMs = 0

  set = (fn: () => void, ms: number): unknown => {
    const id = this.nextId++
    this.tasks.push({ id, at: this.nowMs + ms, fn })
    return id
  }

  clear = (handle: unknown): void => {
    this.tasks = this.tasks.filter((task) => task.id !== handle)
  }

  async advance(ms: number): Promise<void> {
    this.nowMs += ms
    const due = this.tasks.filter((task) => task.at <= this.nowMs)
    this.tasks = this.tasks.filter((task) => task.at > this.nowMs)
    for (const task of due) task.fn()
    // Let the async work triggered by the callbacks settle.
    await sleep(50)
  }
}

export interface TestServer {
  url: string
  db: Db
  server: WsServer
  timers: ManualTimers
  signToken: (userId: string) => Promise<string>
  connectAs: (userId: string) => Promise<ClientSocket>
  disconnectAll: () => void
  reset: (userIds?: string[]) => Promise<void>
  stop: () => Promise<void>
}

export async function startTestServer(
  overrides: Partial<WsServerDeps> = {}
): Promise<TestServer> {
  const db = createDb(TEST_DATABASE_URL)
  const { publicKey, privateKey } = await generateKeyPair('EdDSA')
  const timers = new ManualTimers()
  const server = createWsServer({
    db,
    verifyToken: async (token) => {
      const { payload } = await jwtVerify(token, publicKey)
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new Error('token has no subject')
      }
      return { userId: payload.sub }
    },
    webOrigin: 'http://localhost:3000',
    timers,
    ...overrides,
  })
  await new Promise<void>((resolve) => {
    server.httpServer.listen(0, resolve)
  })
  const port = (server.httpServer.address() as AddressInfo).port
  const url = `http://127.0.0.1:${port}`
  const sockets: ClientSocket[] = []

  const signToken = (userId: string): Promise<string> =>
    new SignJWT({}).setProtectedHeader({ alg: 'EdDSA' }).setSubject(userId).sign(privateKey)

  const connectAs = async (userId: string): Promise<ClientSocket> => {
    const socket = ioc(url, {
      auth: { token: await signToken(userId) },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    })
    sockets.push(socket)
    await waitForConnect(socket)
    return socket
  }

  const disconnectAll = (): void => {
    for (const socket of sockets.splice(0)) socket.disconnect()
  }

  const reset = async (userIds: string[] = []): Promise<void> => {
    disconnectAll()
    await truncateAll(db)
    for (const id of userIds) await createTestUser(db, { id, username: id })
  }

  const stop = async (): Promise<void> => {
    disconnectAll()
    await sleep(100) // let disconnect handlers finish their queries
    await server.close()
    await db.$client.end({ timeout: 5 })
  }

  return { url, db, server, timers, signToken, connectAs, disconnectAll, reset, stop }
}

export function waitForConnect(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve())
    socket.once('connect_error', (error) => reject(error))
  })
}

/** Connects expecting a handshake failure; resolves with the error message. */
export async function connectExpectError(url: string, token: string | null): Promise<string> {
  const socket = ioc(url, {
    auth: token === null ? {} : { token },
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  })
  try {
    return await new Promise<string>((resolve, reject) => {
      socket.once('connect', () => reject(new Error('expected connect_error')))
      socket.once('connect_error', (error) => resolve(error.message))
    })
  } finally {
    socket.disconnect()
  }
}

export function waitForEvent<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeoutMs = 4000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent)
      reject(new Error(`timed out waiting for "${event}"`))
    }, timeoutMs)
    const onEvent = (payload: T): void => {
      clearTimeout(timer)
      resolve(payload)
    }
    socket.once(event, onEvent)
  })
}

/** Resolves on the first event payload matching the predicate. */
export function waitForEventMatching<T = unknown>(
  socket: ClientSocket,
  event: string,
  predicate: (payload: T) => boolean,
  timeoutMs = 4000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent)
      reject(new Error(`timed out waiting for matching "${event}"`))
    }, timeoutMs)
    const onEvent = (payload: T): void => {
      if (!predicate(payload)) return
      clearTimeout(timer)
      socket.off(event, onEvent)
      resolve(payload)
    }
    socket.on(event, onEvent)
  })
}

/** Collects `count` occurrences of an event; attach BEFORE triggering. */
export function collectEvents<T = unknown>(
  socket: ClientSocket,
  event: string,
  count: number,
  timeoutMs = 4000
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const received: T[] = []
    const timer = setTimeout(() => {
      socket.off(event, onEvent)
      reject(new Error(`timed out: got ${received.length}/${count} "${event}"`))
    }, timeoutMs)
    const onEvent = (payload: T): void => {
      received.push(payload)
      if (received.length === count) {
        clearTimeout(timer)
        socket.off(event, onEvent)
        resolve(received)
      }
    }
    socket.on(event, onEvent)
  })
}

/** Asserts that no `event` arrives within the window. */
export async function expectNoEvent(
  socket: ClientSocket,
  event: string,
  windowMs = 250
): Promise<void> {
  let received: unknown = undefined
  let hit = false
  const onEvent = (payload: unknown): void => {
    hit = true
    received = payload
  }
  socket.on(event, onEvent)
  await sleep(windowMs)
  socket.off(event, onEvent)
  if (hit) throw new Error(`unexpected "${event}": ${JSON.stringify(received)}`)
}

export async function emitAck<T extends object = Record<never, never>>(
  socket: ClientSocket,
  event: string,
  payload: unknown
): Promise<Ack<T>> {
  return (await socket.emitWithAck(event, payload)) as Ack<T>
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function expectOk<T extends object>(ack: Ack<T>): { ok: true } & T {
  if (!ack.ok) throw new Error(`expected ok ack, got ${JSON.stringify(ack)}`)
  return ack
}
