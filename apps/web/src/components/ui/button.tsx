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

export function Button({
  children,
  variant = 'primary',
  type = 'button',
  fullWidth = true,
  disabled = false,
  helper,
  onClick,
}: ButtonProps) {
  const button = (
    <button
      className={variant === 'ghost' ? 'cta ghost' : 'cta'}
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={fullWidth ? undefined : { width: 'auto' }}
    >
      {children}
    </button>
  )

  if (!helper) return button

  return (
    <div className="flex flex-col gap-1.5">
      {button}
      <p className="helper-text">{helper}</p>
    </div>
  )
}
