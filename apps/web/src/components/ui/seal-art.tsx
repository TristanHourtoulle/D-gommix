import type { ReactElement } from 'react'
import type { SealId } from '@degommix/game-core'

/**
 * The six haut-fait drawings. Each returns the *body* of a 0 0 100 100 SVG;
 * `SealMedallion` provides the <svg> wrapper and the bronze ring — same split
 * as AvatarArt / PlayerAvatar.
 *
 * These belong to the « Sceaux gravés » family of the avatar board
 * (apps/web/src/lib/avatars.ts, board 'sceaux'): engraved line work on a warm
 * disc, one strong silhouette, no text. Unlike the avatars these are UI
 * chrome, so they take their colour from `currentColor` and the caller themes
 * them — a locked seal is the same drawing at low opacity in --ink-faint.
 */
export function SealArt({ sealId }: { sealId: SealId }): ReactElement | null {
  const disc = <circle cx="50" cy="50" r="50" fill="var(--bronze-tint)" />
  const engraved = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 3.5,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
  } as const

  switch (sealId) {
    // Laurel wreath closing around a small standing pion.
    case 'imperator':
      return (
        <>
          {disc}
          <path d="M50 22c-16 6-24 20-24 34 0 10 4 17 10 22" {...engraved} />
          <path d="M50 22c16 6 24 20 24 34 0 10-4 17-10 22" {...engraved} />
          <path d="M34 40c-6-1-10 2-12 6M32 54c-6 0-9 3-10 8M38 67c-5 1-8 5-8 10" {...engraved} />
          <path d="M66 40c6-1 10 2 12 6M68 54c6 0 9 3 10 8M62 67c5 1 8 5 8 10" {...engraved} />
          <circle cx="50" cy="46" r="7" {...engraved} />
          <path d="M43 74c0-8 3-14 7-16 4 2 7 8 7 16Z" {...engraved} />
        </>
      )

    // A circle of four menhirs, one taller, with a path looping past all four.
    case 'village_tour':
      return (
        <>
          {disc}
          <circle cx="50" cy="52" r="26" strokeDasharray="6 5" {...engraved} />
          <path d="M44 16h12v20H44Z" {...engraved} />
          <path d="M20 46h11v16H20Z" {...engraved} />
          <path d="M69 46h11v16H69Z" {...engraved} />
          <path d="M44 70h12v16H44Z" {...engraved} />
        </>
      )

    // A single laurel branch over a Roman numeral I.
    case 'first_win':
      return (
        <>
          {disc}
          <path d="M22 34c14-10 30-11 44-4" {...engraved} />
          <path d="M30 30c-2-6 0-11 5-14M42 25c-1-6 2-11 7-13M55 25c1-6 5-9 11-9" {...engraved} />
          <path d="M38 50h24M38 84h24M50 50v34" {...engraved} />
        </>
      )

    // A legion standard with an X on its banner.
    case 'decurion':
      return (
        <>
          {disc}
          <path d="M50 14v72" {...engraved} />
          <path d="M36 20h28" {...engraved} />
          <path d="M32 32h36v30H32Z" {...engraved} />
          <path d="M40 40l20 14M60 40 40 54" {...engraved} />
        </>
      )

    // Three ascending waves under a rising sun disc.
    case 'rising_tide':
      return (
        <>
          {disc}
          <circle cx="50" cy="30" r="13" {...engraved} />
          <path d="M22 30h-6M78 30h6M31 12l-4-4M69 12l4-4" {...engraved} />
          <path d="M16 58c8-7 14-7 22 0s14 7 22 0 14-7 22 0" {...engraved} />
          <path d="M16 70c8-7 14-7 22 0s14 7 22 0 14-7 22 0" {...engraved} />
          <path d="M16 82c8-7 14-7 22 0s14 7 22 0 14-7 22 0" {...engraved} />
        </>
      )

    // A round Gaulish shield with a central umbo and two crossed bands, untouched.
    case 'arvern_shield':
      return (
        <>
          {disc}
          <path d="M50 12c14 4 24 12 24 24 0 24-11 42-24 52-13-10-24-28-24-52 0-12 10-20 24-24Z" {...engraved} />
          <path d="M30 40h40M50 22v58" {...engraved} />
          <circle cx="50" cy="52" r="9" {...engraved} />
        </>
      )
  }
}
