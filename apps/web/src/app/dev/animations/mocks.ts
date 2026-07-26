import type { CharacterId, DegommageEntry, GameState } from '@degommix/game-core'
import type { NameMap } from '@/components/live/types'

/**
 * Hard-coded game used by the animations playground. Nothing here ever reaches
 * the server: the screen mounts the real live components on this data so the
 * sequences can be watched without playing a game.
 */

/** Stable id: `pickTease` and `confettiPieces` are seeded from it, so the demo repeats identically. */
export const DEMO_GAME_ID = 'demo-animations'

export const HERO_ID = 'demo-hero'
export const RIVAL_ID = 'demo-rival'

export const DEMO_NAMES: NameMap = {
  [HERO_ID]: 'Astérix',
  [RIVAL_ID]: 'Caius Bonus',
}

/**
 * Eight hits on the hero, with non-consecutive `seq` values: `hitByTarget`
 * hashes the seq, so varied seeds make the onomatopée rotation look like a real
 * game instead of a period-2 cycle.
 */
export const DEMO_LOG: readonly DegommageEntry[] = [
  { seq: 3, actorId: RIVAL_ID, targetId: HERO_ID },
  { seq: 7, actorId: RIVAL_ID, targetId: HERO_ID },
  { seq: 12, actorId: RIVAL_ID, targetId: HERO_ID },
  { seq: 18, actorId: RIVAL_ID, targetId: HERO_ID },
  { seq: 25, actorId: RIVAL_ID, targetId: HERO_ID },
  { seq: 31, actorId: RIVAL_ID, targetId: HERO_ID },
  { seq: 40, actorId: RIVAL_ID, targetId: HERO_ID },
  { seq: 46, actorId: RIVAL_ID, targetId: HERO_ID },
]

/**
 * Actor map fed to `hitByTarget` by the playground. The demo log's only actor
 * is `RIVAL_ID`, so overriding that seat's character is what switches the hit
 * variant on the demo card — the exact mechanism a real game uses, minus the
 * game.
 */
export function demoActors(camp: CharacterId): Record<string, { character: CharacterId }> {
  return {
    [RIVAL_ID]: { character: camp },
    [HERO_ID]: { character: 'asterix' },
  }
}

/** Finished 1v1 won by the hero at the village — the input of both endgame demos. */
export const DEMO_FINISHED: GameState = {
  status: 'finished',
  format: 2,
  seats: [HERO_ID, RIVAL_ID],
  players: {
    [HERO_ID]: { userId: HERO_ID, character: 'asterix', degommages: 7, inGame: true },
    [RIVAL_ID]: { userId: RIVAL_ID, character: 'caius_bonus', degommages: 5, inGame: true },
  },
  degommageLog: [...DEMO_LOG],
  undoneSeqs: new Set<number>(),
  pendingEndRequest: null,
  outcome: 'village_reached',
  winnerId: HERO_ID,
  lastSeq: 46,
}

/** Fixed timestamps ~12 min apart, so the « Durée » tile shows a real chrono. */
export const DEMO_STARTED_AT = '2026-07-25T20:00:00.000Z'
export const DEMO_ENDED_AT = '2026-07-25T20:12:34.000Z'
