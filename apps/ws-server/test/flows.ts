import { randomUUID } from 'node:crypto'
import type { Socket as ClientSocket } from 'socket.io-client'
import type { Ack, CharacterId, Command, GameEvent } from '@degommix/game-core'
import { emitAck, expectOk, type TestServer } from './harness'

export interface StartedGame {
  gameId: string
  code: string
  sockets: Map<string, ClientSocket>
}

const CHARACTER_POOL: CharacterId[] = ['asterix', 'obelix', 'caius_bonus', 'caligula_minus']

/**
 * Full lobby flow: `users[0]` creates, the others join by code, everyone picks
 * a distinct character and the host starts the game.
 */
export async function startGameWith(ts: TestServer, users: string[]): Promise<StartedGame> {
  const sockets = new Map<string, ClientSocket>()
  for (const userId of users) sockets.set(userId, await ts.connectAs(userId))
  const host = users[0]
  if (!host) throw new Error('at least one user required')
  const hostSocket = sockets.get(host)
  if (!hostSocket) throw new Error('host socket missing')

  const created = expectOk(
    await emitAck<{ gameId: string; code: string }>(hostSocket, 'lobby:create', {
      format: users.length,
    })
  )
  for (const userId of users.slice(1)) {
    const socket = sockets.get(userId)
    if (!socket) throw new Error(`socket missing for ${userId}`)
    expectOk(await emitAck(socket, 'lobby:join_by_code', { code: created.code }))
  }
  for (const [index, userId] of users.entries()) {
    const socket = sockets.get(userId)
    if (!socket) throw new Error(`socket missing for ${userId}`)
    expectOk(
      await emitAck(socket, 'lobby:pick_character', {
        gameId: created.gameId,
        character: CHARACTER_POOL[index],
      })
    )
  }
  expectOk(
    await emitAck<{ firstEvents: GameEvent[] }>(hostSocket, 'lobby:start', {
      gameId: created.gameId,
    })
  )
  return { gameId: created.gameId, code: created.code, sockets }
}

export async function sendCommand(
  socket: ClientSocket,
  gameId: string,
  command: Command,
  clientEventId: string = randomUUID()
): Promise<Ack<{ seq: number }>> {
  return emitAck<{ seq: number }>(socket, 'game:command', { gameId, clientEventId, command })
}
