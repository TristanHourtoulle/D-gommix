import type { ReactNode } from 'react'

interface ButtonProps {
  children: ReactNode
  variant?: 'primary' | 'ghost'
  type?: 'button' | 'submit'
  fullWidth?: boolean
  disabled?: boolean
  /** Small helper line displayed under the button (e.g. why it is disabled) */
  helper?: string
  onClick?: () => void
}

/**
 * Primary call-to-action, styled as a Dégommix arcade key: a parchment/bronze face
 * riding on a solid ink lip that gets swallowed on press (see `.cta` in globals.css).
 */
export function Button({
  children,
  variant = 'primary',
  type = 'button',
  fullWidth = true,
  disabled = false,
  helper,
  onClick,
}: ButtonProps) {
  const className = ['cta', variant === 'ghost' && 'ghost', !fullWidth && 'auto']
    .filter(Boolean)
    .join(' ')

  const button = (
    <button className={className} type={type} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  )

  if (!helper) return button

  return (
    <div className="flex flex-col gap-1">
      {button}
      <p className="helper-text">{helper}</p>
    </div>
  )
}
