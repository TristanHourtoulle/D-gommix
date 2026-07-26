import { TITLE_META, type TitleId } from '@/lib/titles'

interface PlayerTitleLineProps {
  /** Worn title, or null when the player has none (cold start). */
  titleId: TitleId | null
  /** Podium columns are centred; the two profile headers are left-aligned. */
  align?: 'left' | 'center'
}

/**
 * « Titre gaulois » worn under a pseudo. The bronze italic cousin of
 * `.sec-label` (globals.css): same micro-size and weight, but italic, in
 * bronze, and never uppercased — « L’Increvable » is a proper noun.
 */
export function PlayerTitleLine({ titleId, align = 'left' }: PlayerTitleLineProps) {
  if (titleId === null) return null
  const meta = TITLE_META[titleId]
  return (
    <span
      className={`block max-w-full truncate text-[0.68rem] font-bold italic text-bronze-strong${
        align === 'center' ? ' text-center' : ''
      }`}
      title={meta.hint}
    >
      {meta.label}
    </span>
  )
}
