import type { Presence } from '@degommix/game-core'

export const PRESENCE_LABEL: Record<Presence, string> = {
  online: 'en ligne',
  in_game: 'en partie',
  offline: 'hors ligne',
}

export const PRESENCE_COLOR: Record<Presence, string> = {
  online: 'var(--good)',
  in_game: 'var(--bronze-strong)',
  offline: 'var(--ink-faint)',
}

interface PresenceDotProps {
  presence: Presence
}

/** Coloured dot + French presence label (« en ligne » / « en partie » / « hors ligne »). */
export function PresenceDot({ presence }: PresenceDotProps) {
  return (
    <span className="flex items-center gap-1.5 text-xs" style={{ color: PRESENCE_COLOR[presence] }}>
      <span
        aria-hidden
        className="inline-block h-2 w-2 rounded-full"
        style={{
          background: PRESENCE_COLOR[presence],
          opacity: presence === 'offline' ? 0.45 : 1,
        }}
      />
      {PRESENCE_LABEL[presence]}
    </span>
  )
}
