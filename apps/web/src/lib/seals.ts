import { SEAL_IDS, type SealId } from '@degommix/game-core'

export interface SealMeta {
  readonly id: SealId
  /** French name, owner-validated verbatim. Do not reword. */
  readonly label: string
  /** How it is earned, shown under the name and used as the accessible name. */
  readonly hint: string
}

/**
 * French face of the six hauts faits. Ids (the storage key and the allowlist)
 * live in packages/game-core/src/seals.ts; the labels live here next to the
 * artwork, exactly like the avatar catalog splits ids from labels.
 *
 * Order matches SEAL_IDS and is the display order of the profile board.
 */
export const SEALS: readonly SealMeta[] = [
  { id: 'imperator', label: 'Imperator', hint: 'Gagner une partie sans se faire dégommer' },
  {
    id: 'village_tour',
    label: 'Tour du village',
    hint: 'Dégommer chaque adversaire dans une même partie',
  },
  { id: 'first_win', label: 'Premier de cordée', hint: 'Remporter sa première partie' },
  { id: 'decurion', label: 'Décurion', hint: 'Remporter 10 parties' },
  { id: 'rising_tide', label: 'Marée montante', hint: '3 victoires d’affilée' },
  {
    id: 'arvern_shield',
    label: 'Bouclier arverne',
    hint: 'Finir une partie sans se faire dégommer',
  },
]

const BY_ID = new Map<SealId, SealMeta>(SEALS.map((seal) => [seal.id, seal]))

export function sealMeta(id: SealId): SealMeta | undefined {
  return BY_ID.get(id)
}

/** Total number of seals there is to chase — the « n/6 » denominator. */
export const SEAL_COUNT = SEAL_IDS.length
