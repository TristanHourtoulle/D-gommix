import { AvatarArt } from './avatar-art'
import { isKnownAvatarId } from '@/lib/avatars'

interface PlayerAvatarProps {
  username: string
  size?: 32 | 40 | 44 | 56 | 96
  /**
   * Avatar chosen from the profile. `null`/`undefined` — or an id this build
   * does not know — falls back to the pseudo initial, which is what the app
   * has always shown.
   */
  avatarId?: string | null
}

/** Chosen avatar, or the uppercase initial, inside a bronze ring. */
export function PlayerAvatar({ username, size = 40, avatarId }: PlayerAvatarProps) {
  const initial = username.charAt(0).toUpperCase()

  if (isKnownAvatarId(avatarId) && avatarId) {
    return (
      <span className="avatar-ring art" style={{ width: size, height: size }} aria-hidden>
        <svg viewBox="0 0 100 100" focusable="false">
          <AvatarArt avatarId={avatarId} initial={initial} />
        </svg>
      </span>
    )
  }

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
