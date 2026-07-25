/**
 * The sixteen built-in avatars. Three boards were proposed and all three ship:
 * every player picks freely, and `null` (nobody picked) keeps the pseudo
 * initial that the app has always shown.
 *
 * The ids are a closed set on purpose — they are the server-side allowlist
 * (`avatarIdSchema`) and the key of the artwork lookup in
 * `components/ui/avatar-art.tsx`. Never accept a free-form string here.
 */
import { z } from 'zod'

export const AVATAR_BOARDS = ['portraits', 'emblemes', 'sceaux'] as const
export type AvatarBoard = (typeof AVATAR_BOARDS)[number]

/** French heading for each board, shown above its grid in the picker. */
export const AVATAR_BOARD_LABELS: Record<AvatarBoard, string> = {
  portraits: 'Portraits',
  emblemes: 'Emblèmes',
  sceaux: 'Sceaux gravés',
}

export interface AvatarMeta {
  readonly id: string
  readonly board: AvatarBoard
  /** Name shown under the ring in the picker. */
  readonly label: string
  /** One-line description, also used as the ring's accessible name. */
  readonly hint: string
}

export const AVATARS: readonly AvatarMeta[] = [
  {
    id: 'a-moustachu',
    board: 'portraits',
    label: 'Le Moustachu',
    hint: 'Casque ailé, tunique rouge',
  },
  { id: 'a-guerriere', board: 'portraits', label: 'La Guerrière', hint: 'Tresses et torque d’or' },
  { id: 'a-druide', board: 'portraits', label: 'Le Druide', hint: 'Capuche verte, barbe blanche' },
  { id: 'a-centurion', board: 'portraits', label: 'Le Centurion', hint: 'Cimier transversal rouge' },
  {
    id: 'a-patricienne',
    board: 'portraits',
    label: 'La Patricienne',
    hint: 'Couronne de laurier, chignon',
  },
  {
    id: 'a-legionnaire',
    board: 'portraits',
    label: 'Le Légionnaire',
    hint: 'Couvre-joues, bouclier bleu',
  },
  {
    id: 'b-casque-aile',
    board: 'emblemes',
    label: 'Casque Ailé',
    hint: 'Rouge camp · l’emblème gaulois',
  },
  { id: 'b-menhir', board: 'emblemes', label: 'Le Menhir', hint: 'Vert camp · pierre levée' },
  {
    id: 'b-sanglier',
    board: 'emblemes',
    label: 'Le Sanglier',
    hint: 'Bronze · silhouette géométrique',
  },
  {
    id: 'b-cimier',
    board: 'emblemes',
    label: 'Casque à Cimier',
    hint: 'Bleu camp · crête et couvre-joues',
  },
  { id: 'b-aigle', board: 'emblemes', label: 'L’Aigle', hint: 'Jaune camp · enseigne de légion' },
  { id: 'b-bouclier', board: 'emblemes', label: 'Le Bouclier', hint: 'Rouge camp · umbo et foudres' },
  { id: 'c-torque', board: 'sceaux', label: 'Le Torque', hint: 'Collier ouvert à deux tampons' },
  { id: 'c-lyre', board: 'sceaux', label: 'Le Barde', hint: 'Lyre à trois cordes' },
  { id: 'c-enseigne', board: 'sceaux', label: 'L’Enseigne', hint: 'Étendard à franges' },
  { id: 'c-sceau', board: 'sceaux', label: 'Le Sceau', hint: 'Laurier + initiale du membre' },
]

export const AVATAR_IDS = AVATARS.map((avatar) => avatar.id)

/** Server-side allowlist. `null` is a legal value: it means "back to the initial". */
export const avatarIdSchema = z.enum(AVATAR_IDS as [string, ...string[]]).nullable()

/** `true` when the id is one this build knows how to draw. */
export function isKnownAvatarId(id: string | null | undefined): boolean {
  return typeof id === 'string' && AVATAR_IDS.includes(id)
}

/** Avatars of one board, in catalog order. */
export function avatarsOfBoard(board: AvatarBoard): readonly AvatarMeta[] {
  return AVATARS.filter((avatar) => avatar.board === board)
}
