import type { ReactElement } from 'react'
import type { SealId } from '@degommix/game-core'

/**
 * Sixteen drawings since plan 039 (six from plan 033, ten added).
 *
 * The haut-fait drawings. Each returns the *body* of a 0 0 100 100 SVG;
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
          <path
            d="M50 12c14 4 24 12 24 24 0 24-11 42-24 52-13-10-24-28-24-52 0-12 10-20 24-24Z"
            {...engraved}
          />
          <path d="M30 40h40M50 22v58" {...engraved} />
          <circle cx="50" cy="52" r="9" {...engraved} />
        </>
      )

    // A tall standing menhir, planted, with three impact chips on its flank.
    case 'menhir':
      return (
        <>
          {disc}
          <path d="M38 84V32c0-10 5-16 12-16s12 6 12 16v52Z" {...engraved} />
          <path d="M26 84h48" {...engraved} />
          <path d="M44 40l-6 6M46 56l-6 6M46 72l-6 6" {...engraved} />
        </>
      )

    // A jagged bolt splitting a small hourglass.
    case 'toutatis_bolt':
      return (
        <>
          {disc}
          <path d="M30 16h40M30 84h40" {...engraved} />
          <path d="M34 16c0 18 10 26 16 34-6 8-16 16-16 34" {...engraved} />
          <path d="M66 16c0 18-10 26-16 34 6 8 16 16 16 34" {...engraved} />
          <path d="M58 24 42 50h14L40 76" {...engraved} />
        </>
      )

    // An hourglass run out, with a winding path behind it.
    case 'marathon':
      return (
        <>
          {disc}
          <path d="M14 26c14 8 8 20 22 26s10 18 24 24" {...engraved} strokeDasharray="6 6" />
          <path d="M40 14h36M40 86h36" {...engraved} />
          <path d="M44 14c0 16 8 24 14 32-6 8-14 16-14 40" {...engraved} />
          <path d="M72 14c0 16-8 24-14 32 6 8 14 16 14 40" {...engraved} />
          <path d="M48 78h16" {...engraved} />
        </>
      )

    // A laurel crown toppled on its side, one leaf broken off.
    case 'champion_slayer':
      return (
        <>
          {disc}
          <path d="M28 74c-10-12-8-30 6-40 14-10 32-8 40 4" {...engraved} />
          <path d="M28 74c14 8 32 6 42-6" {...engraved} />
          <path d="M36 44c-5-4-6-9-4-14M50 34c-4-5-4-10-1-14M64 32c-2-6 0-10 4-13" {...engraved} />
          <path d="M74 60l14 10M88 56 74 66" {...engraved} />
        </>
      )

    // Four small discs in a square, linked by a ring.
    case 'collector':
      return (
        <>
          {disc}
          <circle cx="50" cy="50" r="26" strokeDasharray="5 5" {...engraved} />
          <circle cx="34" cy="34" r="9" {...engraved} />
          <circle cx="66" cy="34" r="9" {...engraved} />
          <circle cx="34" cy="66" r="9" {...engraved} />
          <circle cx="66" cy="66" r="9" {...engraved} />
        </>
      )

    // A crested Roman helmet in profile.
    case 'centurion':
      return (
        <>
          {disc}
          <path d="M28 62c0-20 10-32 22-32s22 12 22 32" {...engraved} />
          <path d="M28 62c0 12 8 22 22 22s22-10 22-22" {...engraved} />
          <path d="M50 30c0-10 3-16 8-20 3 8 3 14 0 20" {...engraved} />
          <path d="M50 48v24M34 60h32" {...engraved} />
        </>
      )

    // Two crossed swords inside a circular return arrow.
    case 'avenger':
      return (
        <>
          {disc}
          <path d="M78 44a30 30 0 1 0-4 22" {...engraved} />
          <path d="M74 66l-2 12 12-4" {...engraved} />
          <path d="M34 34 62 62M62 34 34 62" {...engraved} />
          <path d="M28 40h12M60 40h12" {...engraved} />
        </>
      )

    // A palisade gate with a standard planted beside it.
    case 'camp_chief':
      return (
        <>
          {disc}
          <path d="M20 84V44l14-10 14 10v40Z" {...engraved} />
          <path d="M20 56h28M34 56v28" {...engraved} />
          <path d="M70 84V20" {...engraved} />
          <path d="M70 26h16v14H70Z" {...engraved} />
        </>
      )

    // An unbroken laurel ring, closed, with a full crescent inside.
    case 'unbeaten':
      return (
        <>
          {disc}
          <circle cx="50" cy="50" r="30" {...engraved} />
          <path d="M28 30c-6 0-10 3-12 8M22 52c-6 1-9 5-9 11" {...engraved} />
          <path d="M72 30c6 0 10 3 12 8M78 52c6 1 9 5 9 11" {...engraved} />
          <path d="M58 34a18 18 0 1 0 0 32 20 20 0 0 1 0-32Z" {...engraved} />
        </>
      )

    // A boar in profile, one strong silhouette.
    case 'golden_boar':
      return (
        <>
          {disc}
          <path
            d="M18 58c0-12 12-20 26-20h14l12-10 4 12 10 4-8 8c2 12-6 22-20 22H36Z"
            {...engraved}
          />
          <path d="M32 74v10M56 74v10" {...engraved} />
          <path d="M76 50c4 4 4 8 0 10" {...engraved} />
          <circle cx="66" cy="44" r="2" fill="currentColor" />
        </>
      )
  }
}
