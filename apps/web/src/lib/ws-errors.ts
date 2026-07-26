import type { Ack, ErrorCode } from '@degommix/game-core'
import { isAckTimeout } from './socket'

/** Toast shown when a game command could not be delivered (design §4.5). */
export const DELIVERY_FAILED_MESSAGE = 'Action non transmise — vérifie ta connexion'

const MESSAGES: Record<ErrorCode, string> = {
  AUTH_FAILED: 'Session expirée, reconnecte-toi',
  NOT_FOUND: 'Introuvable — la partie ou la demande n’existe plus',
  NOT_MEMBER: 'Tu ne fais pas partie de cette partie',
  NOT_HOST: 'Seul le chef de camp peut faire ça',
  ALREADY_IN_GAME: 'Tu as déjà une partie en cours',
  LOBBY_FULL: 'Le lobby est complet',
  LOBBY_ALREADY_STARTED: 'La partie a déjà été lancée',
  INVALID_CODE: 'Code invalide ou partie déjà lancée',
  CHARACTER_TAKEN: 'Trop tard, ce personnage est déjà pris',
  FORMAT_INCOMPATIBLE: 'Format incompatible avec les joueurs présents',
  PENDING_INVITES: 'Des invitations sont encore en attente',
  GAME_NOT_ACTIVE: 'La partie n’est pas en cours',
  GAME_FINISHED: 'La partie est déjà terminée',
  PLAYER_LEFT: 'Ce joueur a quitté la partie',
  INVALID_TARGET: 'Cible invalide',
  NOTHING_TO_UNDO: 'Rien à annuler',
  END_REQUEST_PENDING: 'Une demande de fin est déjà en attente',
  NO_PENDING_REQUEST: 'Aucune demande de fin en attente',
  USERNAME_TAKEN: 'Ce pseudo est déjà pris',
  RATE_LIMITED: 'Doucement ! Réessaie dans un instant',
  INTERNAL: 'Une erreur est survenue, réessaie',
}

/** French user-facing message for a ws error code (INTERNAL as fallback). */
export function wsErrorMessage(code: ErrorCode): string {
  return MESSAGES[code] ?? MESSAGES.INTERNAL
}

/**
 * French message for a failed ack: local delivery timeouts get the dedicated
 * « Action non transmise » toast, server errors go through the code mapping.
 */
export function ackErrorMessage(ack: Extract<Ack<object>, { ok: false }>): string {
  if (isAckTimeout(ack)) return DELIVERY_FAILED_MESSAGE
  return wsErrorMessage(ack.code)
}
