import type { Db } from '@degommix/db'
import type { GameManager } from './game-manager'
import type { HostTransferManager } from './host-transfer'
import type { PresenceTracker } from './presence'
import type { RateLimiter } from './rate-limit'
import type { AppServer } from './socket-types'

/** Shared dependencies handed to every handler module. */
export interface AppContext {
  db: Db
  io: AppServer
  presence: PresenceTracker
  manager: GameManager
  hostTransfer: HostTransferManager
  limiter: RateLimiter
}
