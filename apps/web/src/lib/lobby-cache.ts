import type { AppSocket, LobbyState } from './realtime-types'

/**
 * Module-level cache of the latest `lobby:state` per game. The server pushes
 * the state right before the `lobby:create` / `lobby:respond_invite` acks, so
 * it can arrive while the app is still navigating towards `/lobby/[gameId]`
 * and no lobby screen is mounted yet. The listener is attached as soon as the
 * socket exists (SocketProvider) so that early broadcast is never lost.
 */
const cache = new Map<string, LobbyState>()
let attachedTo: AppSocket | null = null

export function attachLobbyCache(socket: AppSocket): void {
  if (attachedTo === socket) return
  attachedTo = socket
  socket.on('lobby:state', (state) => {
    cache.set(state.gameId, state)
  })
}

export function getCachedLobbyState(gameId: string): LobbyState | null {
  return cache.get(gameId) ?? null
}
