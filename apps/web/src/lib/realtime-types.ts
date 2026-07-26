import type { Socket } from 'socket.io-client'
import type {
  Ack,
  CharacterId,
  Command,
  GameEvent,
  GameFormat,
  Presence,
} from '@degommix/game-core'

/** Mirror of the ws-server `LobbyPlayer` shape (apps/ws-server/src/lobby-state.ts). */
export interface LobbyPlayer {
  userId: string
  username: string
  status: 'invited' | 'joined'
  character: CharacterId | null
  /** Optional on this side: an older ws-server build does not send it. */
  avatarId?: string | null
}

/** Mirror of the ws-server `LobbyState` broadcast payload. */
export interface LobbyState {
  gameId: string
  code: string
  format: GameFormat
  hostId: string
  players: LobbyPlayer[]
}

export interface InviteReceivedPayload {
  gameId: string
  hostUsername: string
  format: GameFormat
  /**
   * Id of the finished game this invitation is a rematch of. Only set on the
   * live `replay:create` broadcast — the reconnect re-push and the invites
   * endpoint cannot derive it (no db column), so consumers must treat it as a
   * hint, not a guarantee.
   */
  rematchOf?: string
}

export interface InviteCanceledPayload {
  gameId: string
}

export type FriendsEventKind = 'request_received' | 'request_accepted' | 'request_canceled'

export interface FriendsEventPayload {
  kind: FriendsEventKind
  requestId: string
  from: { id: string; username: string }
}

export interface PresenceUpdatePayload {
  userId: string
  presence: Presence
  /** ISO timestamp of the last connection; only set when `presence` is `offline`. */
  lastSeenAt?: string
}

export interface GameStateSnapshotPayload {
  gameId: string
  events: GameEvent[]
  serverNow: number
  hostId: string
}

export interface HostChangedPayload {
  newHostId: string
}

export interface KickedPayload {
  gameId: string
}

/**
 * Server-side hint that persisted stats changed and the tab payloads
 * (home, leaderboard) must be revalidated. Carries no data on purpose:
 * clients refetch through their session-authenticated endpoints.
 */
export interface StatsInvalidatePayload {
  scope: 'game_finished'
}

/** Broadcasts pushed by the ws-server (rooms `user:{id}` / `game:{id}`). */
export interface ServerToClientEvents {
  'game:event': (event: GameEvent) => void
  'game:state_snapshot': (payload: GameStateSnapshotPayload) => void
  'game:host_changed': (payload: HostChangedPayload) => void
  'game:kicked': (payload: KickedPayload) => void
  'lobby:state': (state: LobbyState) => void
  'invite:received': (payload: InviteReceivedPayload) => void
  'invite:canceled': (payload: InviteCanceledPayload) => void
  'friends:event': (payload: FriendsEventPayload) => void
  'presence:update': (payload: PresenceUpdatePayload) => void
  'stats:invalidate': (payload: StatsInvalidatePayload) => void
}

/** Client → server commands: event name → payload and ack result shapes. */
export interface CommandMap {
  'friends:request': {
    payload: { receiverId: string }
    result: { requestId: string }
  }
  'friends:respond': {
    payload: { requestId: string; accept: boolean }
    result: Record<never, never>
  }
  'friends:cancel': {
    payload: { requestId: string }
    result: Record<never, never>
  }
  'friends:remove': {
    payload: { friendId: string }
    result: Record<never, never>
  }
  'lobby:create': {
    payload: { format: GameFormat }
    result: { gameId: string; code: string }
  }
  'lobby:invite': {
    payload: { gameId: string; friendId: string }
    result: Record<never, never>
  }
  'lobby:cancel_invite': {
    payload: { gameId: string; userId: string }
    result: Record<never, never>
  }
  'lobby:respond_invite': {
    payload: { gameId: string; accept: boolean }
    result: { lobbyState?: LobbyState | null }
  }
  'lobby:join_by_code': {
    payload: { code: string }
    result: { gameId: string; lobbyState: LobbyState | null }
  }
  'lobby:pick_character': {
    payload: { gameId: string; character: CharacterId }
    result: Record<never, never>
  }
  'lobby:set_format': {
    payload: { gameId: string; format: GameFormat }
    result: Record<never, never>
  }
  'lobby:kick': {
    payload: { gameId: string; userId: string }
    result: Record<never, never>
  }
  'lobby:leave': {
    payload: { gameId: string }
    result: Record<never, never>
  }
  'lobby:start': {
    payload: { gameId: string }
    result: { firstEvents: GameEvent[] }
  }
  'game:command': {
    payload: { gameId: string; clientEventId: string; command: Command }
    result: { seq: number }
  }
  'game:resync': {
    payload: { gameId: string; lastSeq: number }
    result: { events: GameEvent[]; serverNow: number }
  }
  'replay:create': {
    payload: { finishedGameId: string }
    result: { gameId: string; code: string }
  }
}

export type CommandName = keyof CommandMap

export type ClientToServerEvents = {
  [K in CommandName]: (
    payload: CommandMap[K]['payload'],
    ack: (response: Ack<CommandMap[K]['result']>) => void
  ) => void
}

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/** Minimal emitter surface used by the ack helpers (mockable in tests). */
export interface AckEmitter {
  emit: <K extends CommandName>(
    event: K,
    payload: CommandMap[K]['payload'],
    ack: (response: Ack<CommandMap[K]['result']>) => void
  ) => unknown
}
