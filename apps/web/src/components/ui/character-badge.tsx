import Image from 'next/image'
import type { CSSProperties } from 'react'
import type { CharacterId } from '@degommix/game-core'
import { CHARACTER_META } from '@/lib/characters'

const SIZES = { sm: 26, md: 34, lg: 64 } as const

interface CharacterBadgeProps {
  character: CharacterId
  size?: keyof typeof SIZES
}

/** Circular head portrait ringed with the character's camp color. */
export function CharacterBadge({ character, size = 'md' }: CharacterBadgeProps) {
  const { label, colorVar, headSrc } = CHARACTER_META[character]
  const px = SIZES[size]

  return (
    <span
      className={`char-badge ${size}`}
      style={{ '--c': colorVar } as CSSProperties}
      title={label}
    >
      <Image className="portrait" src={headSrc} alt={label} width={px} height={px} />
    </span>
  )
}
