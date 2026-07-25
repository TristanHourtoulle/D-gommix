export const ERROR_CODES = [
  'AUTH_FAILED',
  'NOT_FOUND',
  'NOT_MEMBER',
  'NOT_HOST',
  'ALREADY_IN_GAME',
  'LOBBY_FULL',
  'LOBBY_ALREADY_STARTED',
  'INVALID_CODE',
  'CHARACTER_TAKEN',
  'FORMAT_INCOMPATIBLE',
  'PENDING_INVITES',
  'GAME_NOT_ACTIVE',
  'GAME_FINISHED',
  'PLAYER_LEFT',
  'INVALID_TARGET',
  'NOTHING_TO_UNDO',
  'END_REQUEST_PENDING',
  'NO_PENDING_REQUEST',
  'USERNAME_TAKEN',
  'RATE_LIMITED',
  'INTERNAL',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export type Ack<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; code: ErrorCode; message: string }

export type Presence = 'online' | 'in_game' | 'offline'
