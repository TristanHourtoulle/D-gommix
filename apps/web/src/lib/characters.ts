import type { CharacterId } from '@degommix/game-core'

export interface CharacterMeta {
  /** French display name */
  label: string
  /** CSS custom property carrying the camp color, e.g. 'var(--asterix)' */
  colorVar: string
  /** Kebab-case file slug under /characters */
  slug: string
  /** Full-body transparent portrait */
  portraitSrc: string
  /** Square 256x256 head crop, used by CharacterBadge */
  headSrc: string
}

function meta(label: string, colorVar: string, slug: string): CharacterMeta {
  return {
    label,
    colorVar,
    slug,
    portraitSrc: `/characters/${slug}.png`,
    headSrc: `/characters/heads/${slug}.png`,
  }
}

export const CHARACTER_META: Record<CharacterId, CharacterMeta> = {
  asterix: meta('Astérix', 'var(--asterix)', 'asterix'),
  obelix: meta('Obélix', 'var(--obelix)', 'obelix'),
  caius_bonus: meta('Caïus Bonus', 'var(--caius)', 'caius-bonus'),
  caligula_minus: meta('Caligula Minus', 'var(--caligula)', 'caligula-minus'),
}

export const CHARACTER_IDS = Object.keys(CHARACTER_META) as CharacterId[]
