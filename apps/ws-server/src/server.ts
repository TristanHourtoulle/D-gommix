import { createServer, type Server as HttpServer } from 'node:http'
import { Server as SocketIOServer } from 'socket.io'
import type { Db } from '@degommix/db'
import type { TokenVerifier } from './auth'
import type { AppContext } from './context'
import { GameManager } from './game-manager'
import { registerGameHandlers } from './handlers/game'
import { registerFriendsHandlers } from './handlers/friends'
import { registerLobbyHandlers } from './handlers/lobby'
import { registerLobbyAdminHandlers } from './handlers/lobby-admin'
import { HostTransferManager, type TimerApi } from './host-transfer'
import { loadLobbyState } from './lobby-state'
import { findActiveMemberships } from './lobby-shared'
import { PresenceTracker } from './presence'
import { RateLimiter } from './rate-limit'
import type { AppServer, AppSocket } from './socket-types'
import { createZombieJob, type ZombieJob } from './zombie-job'

export interface WsServerDeps {
  db: Db
  verifyToken: TokenVerifier
  webOrigin: string
  timers?: TimerApi
  hostTransferDelayMs?: number
  zombieNow?: () => Date
  zombieThresholdMs?: number
  zombieIntervalMs?: number
  /** Starts the periodic zombie sweep (production entry only; tests call tick directly). */
  startJobs?: boolean
}

export interface WsServer {
  httpServer: HttpServer
  io: AppServer
  manager: GameManager
  presence: PresenceTracker
  hostTransfer: HostTransferManager
  zombie: ZombieJob
  close: () => Promise<void>
}

export function createWsServer(deps: WsServerDeps): WsServer {
  const httpServer = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' })
      res.end('ok')
      return
    }
    res.writeHead(404)
    res.end()
  })

  const io: AppServer = new SocketIOServer(httpServer, {
    cors: { origin: deps.webOrigin },
    pingInterval: 25000,
    pingTimeout: 20000,
  })

  const presence = new PresenceTracker(deps.db, io)
  const hostTransfer = new HostTransferManager({
    db: deps.db,
    io,
    isOnline: (userId) => presence.isOnline(userId),
    timers: deps.timers,
    delayMs: deps.hostTransferDelayMs,
  })
  const manager = new GameManager({
    db: deps.db,
    io,
    onFinished: (gameId, state) => {
      hostTransfer.clearGame(gameId)
      for (const userId of state.seats) void presence.setInGame(userId, false)
    },
  })
  const zombie = createZombieJob({
    db: deps.db,
    manager,
    now: deps.zombieNow,
    thresholdMs: deps.zombieThresholdMs,
    intervalMs: deps.zombieIntervalMs,
  })
  const ctx: AppContext = {
    db: deps.db,
    io,
    presence,
    manager,
    hostTransfer,
    limiter: new RateLimiter(),
  }

  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth['token']
    if (typeof token !== 'string') {
      next(new Error('AUTH_FAILED'))
      return
    }
    deps
      .verifyToken(token)
      .then(({ userId }) => {
        socket.data.userId = userId
        next()
      })
      .catch(() => {
        next(new Error('AUTH_FAILED'))
      })
  })

  io.on('connection', (socket) => {
    const userId = socket.data.userId
    void socket.join(`user:${userId}`)
    registerFriendsHandlers(socket, ctx)
    registerLobbyHandlers(socket, ctx)
    registerLobbyAdminHandlers(socket, ctx)
    registerGameHandlers(socket, ctx)
    // Socket counting is synchronous so presence transitions follow event order.
    const becameOnline = presence.registerSocket(userId)
    void onSocketConnected(ctx, socket, becameOnline)
    socket.on('disconnect', () => {
      const wentOffline = presence.unregisterSocket(userId)
      void onSocketDisconnected(ctx, socket, wentOffline)
    })
  })

  if (deps.startJobs === true) zombie.start()

  const close = (): Promise<void> => {
    zombie.stop()
    return new Promise((resolve, reject) => {
      io.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }

  return { httpServer, io, manager, presence, hostTransfer, zombie, close }
}

/** Presence bookkeeping + automatic room re-join and state push at handshake. */
async function onSocketConnected(
  ctx: AppContext,
  socket: AppSocket,
  becameOnline: boolean
): Promise<void> {
  const userId = socket.data.userId
  try {
    ctx.hostTransfer.onUserOnline(userId)
    const memberships = await findActiveMemberships(ctx.db, userId)
    const seated = memberships.find((m) => m.player.status === 'joined')
    ctx.presence.syncInGameFlag(userId, seated?.game.status === 'active')
    if (becameOnline) await ctx.presence.broadcast(userId)
    if (!seated) return
    await socket.join(`game:${seated.game.id}`)
    if (seated.game.status === 'lobby') {
      const state = await loadLobbyState(ctx.db, seated.game.id)
      if (state) socket.emit('lobby:state', state)
    } else if (seated.game.status === 'active') {
      const events = await ctx.manager.getEventsSince(seated.game.id, 0)
      socket.emit('game:state_snapshot', {
        gameId: seated.game.id,
        events,
        serverNow: Date.now(),
        hostId: seated.game.hostId,
      })
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        scope: 'connection',
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
    )
  }
}

async function onSocketDisconnected(
  ctx: AppContext,
  socket: AppSocket,
  wentOffline: boolean
): Promise<void> {
  const userId = socket.data.userId
  try {
    if (!wentOffline) return
    await ctx.presence.broadcast(userId)
    await ctx.hostTransfer.onUserOffline(userId)
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        scope: 'disconnect',
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
    )
  }
}
