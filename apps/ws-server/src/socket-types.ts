import type { Server, Socket } from 'socket.io'

/** Loose event maps: payload validation is done with Zod inside each handler. */
type LooseEvents = Record<string, (...args: unknown[]) => void>

export interface SocketData {
  userId: string
}

export type AppServer = Server<LooseEvents, LooseEvents, LooseEvents, SocketData>
export type AppSocket = Socket<LooseEvents, LooseEvents, LooseEvents, SocketData>
