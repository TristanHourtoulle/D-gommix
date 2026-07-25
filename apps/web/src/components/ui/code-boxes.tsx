'use client'

import { useRef } from 'react'

export const GAME_CODE_LENGTH = 6

interface DisplayProps {
  mode?: 'display'
  code: string
  onChange?: never
}

interface InputProps {
  mode: 'input'
  code: string
  onChange: (code: string) => void
}

type CodeBoxesProps = DisplayProps | InputProps

/**
 * Six-character game code, one box per character.
 * `display` mode is static; `input` mode drives a hidden input so the
 * whole row behaves as a single code field.
 */
export function CodeBoxes(props: CodeBoxesProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const chars = props.code.toUpperCase().slice(0, GAME_CODE_LENGTH)
  const isInput = props.mode === 'input'

  const boxes = Array.from({ length: GAME_CODE_LENGTH }, (_, index) => {
    const char = chars[index] ?? ''
    return (
      <span key={index} className={char ? 'code-box filled' : 'code-box'}>
        {char}
      </span>
    )
  })

  if (!isInput) {
    return <div className="code-boxes">{boxes}</div>
  }

  return (
    <div
      className="code-boxes"
      onClick={() => inputRef.current?.focus()}
      role="presentation"
    >
      <input
        ref={inputRef}
        className="code-input"
        value={chars}
        onChange={(event) => {
          const next = event.target.value
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
            .slice(0, GAME_CODE_LENGTH)
          props.onChange(next)
        }}
        autoCapitalize="characters"
        autoComplete="one-time-code"
        spellCheck={false}
        maxLength={GAME_CODE_LENGTH}
        aria-label="Code de la partie"
      />
      {boxes}
    </div>
  )
}
