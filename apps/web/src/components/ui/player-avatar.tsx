interface PlayerAvatarProps {
  username: string
  size?: 32 | 40 | 44 | 56
}

/** Uppercase initial inside a bronze ring. */
export function PlayerAvatar({ username, size = 40 }: PlayerAvatarProps) {
  const initial = username.charAt(0).toUpperCase()

  return (
    <span
      className="avatar-ring"
      style={{ width: size, height: size, fontSize: `${size * 0.024}rem` }}
      aria-hidden
    >
      {initial}
    </span>
  )
}
