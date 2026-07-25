'use client'

import { Icon, type IconName } from '@/components/icons'

type Tone = 'good' | 'bad' | 'accent' | 'neutral'

const TONE_COLOR: Record<Tone, string> = {
  good: 'var(--good)',
  bad: 'var(--bad)',
  accent: 'var(--bronze-strong)',
  neutral: 'var(--ink-faint)',
}

interface RoundIconButtonProps {
  icon: IconName
  label: string
  tone?: Tone
  disabled?: boolean
  onClick: () => void
}

/** Maquette-style circular icon action (accept / decline / invite / remove). */
export function RoundIconButton({
  icon,
  label,
  tone = 'neutral',
  disabled = false,
  onClick,
}: RoundIconButtonProps) {
  const color = TONE_COLOR[tone]

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      style={{ color, borderColor: color, background: 'var(--surface-2)' }}
    >
      <Icon name={icon} size={14} strokeWidth={2.4} />
    </button>
  )
}
