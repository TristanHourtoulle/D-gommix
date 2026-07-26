import { STAMP_META, type StampId } from '@/lib/game-stamps'

interface MomentStampProps {
  stamp: StampId
  /**
   * Camp colour of the acting player, e.g. `CHARACTER_META[id].colorVar`.
   * Falls back to the bronze of `.moment-stamp` when unknown.
   */
  colorVar?: string
  /** `lg` is the end-of-game size; `sm` (default) rides a journal line. */
  size?: 'sm' | 'lg'
}

/**
 * The ink stamp printed next to a highlighted journal line, or on the
 * end-of-game hero. Same visual language as the dégommage onomatopée
 * (`.hit-stamp`, plan 011) at a marginal-note scale; the label comes from
 * `STAMP_META`, never from the caller.
 */
export function MomentStamp({ stamp, colorVar, size = 'sm' }: MomentStampProps) {
  const meta = STAMP_META[stamp]
  return (
    <span
      className={size === 'lg' ? 'moment-stamp lg' : 'moment-stamp'}
      data-stamp={stamp}
      title={meta.hint}
      style={colorVar === undefined ? undefined : { color: colorVar }}
    >
      {meta.label}
    </span>
  )
}
