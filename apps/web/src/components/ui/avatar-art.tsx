import type { ReactElement } from 'react'

interface AvatarArtProps {
  avatarId: string
  /** Uppercase initial, engraved into `c-sceau` — the one avatar that keeps a letter. */
  initial: string
}

/**
 * The sixteen avatar drawings, transcribed from the validated artwork board.
 * Each returns the *body* of a 0 0 100 100 SVG; `PlayerAvatar` provides the
 * `<svg>` wrapper and the bronze ring around it.
 *
 * The colours are literal hexes on purpose: these are illustrations with their
 * own palette, not themed UI chrome. They read on both the light and the dark
 * parchment because every avatar carries its own opaque background disc.
 */
export function AvatarArt({ avatarId, initial }: AvatarArtProps): ReactElement | null {
  switch (avatarId) {
    case 'a-moustachu':
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#f1d9ab" />
          <path
            d="M12 100c3-17 17-27 38-27s35 10 38 27Z"
            fill="#b23a2e"
            stroke="#251a10"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <rect
            x="43"
            y="60"
            width="14"
            height="16"
            fill="#e8bd92"
            stroke="#251a10"
            strokeWidth="3.5"
          />
          <circle cx="50" cy="52" r="20" fill="#e8bd92" stroke="#251a10" strokeWidth="3.5" />
          <circle cx="42" cy="51" r="2.8" fill="#251a10" />
          <circle cx="58" cy="51" r="2.8" fill="#251a10" />
          <path
            d="M50 61c-6 0-14 3-18 10 9 3 16-1 18-5 2 4 9 8 18 5-4-7-12-10-18-10Z"
            fill="#251a10"
          />
          <path
            d="M27 44a23 23 0 0 1 46 0Z"
            fill="#b9861f"
            stroke="#251a10"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path d="M22 44h56" stroke="#251a10" strokeWidth="4.5" strokeLinecap="round" />
          <path
            d="M29 33 12 17c-2 6-1 12 2 17-4 1-6 3-7 7l22 6Z"
            fill="#fbf6e9"
            stroke="#251a10"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path
            d="M71 33 88 17c2 6 1 12-2 17 4 1 6 3 7 7l-22 6Z"
            fill="#fbf6e9"
            stroke="#251a10"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </>
      )
    case 'a-guerriere':
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#f1d9ab" />
          <path
            d="M12 100c3-17 17-27 38-27s35 10 38 27Z"
            fill="#3f6b3c"
            stroke="#251a10"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <rect
            x="43"
            y="60"
            width="14"
            height="16"
            fill="#e8bd92"
            stroke="#251a10"
            strokeWidth="3.5"
          />
          <circle cx="50" cy="50" r="24" fill="#8c5a2b" stroke="#251a10" strokeWidth="3.5" />
          <circle cx="50" cy="53" r="19" fill="#e8bd92" stroke="#251a10" strokeWidth="3.5" />
          <circle cx="43" cy="51" r="2.8" fill="#251a10" />
          <circle cx="57" cy="51" r="2.8" fill="#251a10" />
          <path
            d="M45 62c3 2.5 7 2.5 10 0"
            stroke="#251a10"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M31 43c3-11 10-17 19-17s16 6 19 17c-5-6-11-9-19-9s-14 3-19 9Z"
            fill="#8c5a2b"
            stroke="#251a10"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path
            d="M28 64c-5 10-6 20-4 30"
            stroke="#8c5a2b"
            strokeWidth="12"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M28 64c-5 10-6 20-4 30"
            stroke="#251a10"
            strokeWidth="14"
            strokeLinecap="butt"
            fill="none"
            strokeDasharray="1.8 8"
          />
          <path
            d="M72 64c5 10 6 20 4 30"
            stroke="#8c5a2b"
            strokeWidth="12"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M72 64c5 10 6 20 4 30"
            stroke="#251a10"
            strokeWidth="14"
            strokeLinecap="butt"
            fill="none"
            strokeDasharray="1.8 8"
          />
          <path d="M36 79a15 11 0 0 0 28 0" stroke="#b9861f" strokeWidth="5" fill="none" />
          <circle cx="36" cy="79" r="4" fill="#b9861f" stroke="#251a10" strokeWidth="2" />
          <circle cx="64" cy="79" r="4" fill="#b9861f" stroke="#251a10" strokeWidth="2" />
        </>
      )
    case 'a-druide':
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#f1d9ab" />
          <path
            d="M8 100c2-17 13-28 28-32h28c15 4 26 15 28 32Z"
            fill="#3f6b3c"
            stroke="#251a10"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <circle cx="50" cy="48" r="19" fill="#e8bd92" stroke="#251a10" strokeWidth="3.5" />
          <path
            d="M31 50c0 11 2 21 6 29 3 7 8 11 13 11s10-4 13-11c4-8 6-18 6-29-4 8-11 12-19 12s-15-4-19-12Z"
            fill="#fbf6e9"
            stroke="#251a10"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path
            d="M39 55c4 3 18 3 22 0"
            stroke="#251a10"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M38 45c2.5-3.5 7-3.5 9.5 0M52.5 45c2.5-3.5 7-3.5 9.5 0"
            stroke="#251a10"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M28 47a22 22 0 0 1 44 0c3-20-9-32-22-32S25 27 28 47Z"
            fill="#3f6b3c"
            stroke="#251a10"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
        </>
      )
    case 'a-centurion':
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#f1d9ab" />
          <path
            d="M12 100c3-17 17-27 38-27s35 10 38 27Z"
            fill="#b23a2e"
            stroke="#251a10"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <rect
            x="43"
            y="62"
            width="14"
            height="14"
            fill="#e8bd92"
            stroke="#251a10"
            strokeWidth="3.5"
          />
          <circle cx="50" cy="53" r="19" fill="#e8bd92" stroke="#251a10" strokeWidth="3.5" />
          <circle cx="43" cy="52" r="2.8" fill="#251a10" />
          <circle cx="57" cy="52" r="2.8" fill="#251a10" />
          <path d="M45 63h10" stroke="#251a10" strokeWidth="3" strokeLinecap="round" />
          <path
            d="M31 44v18c0 5 2 8 5 8 2 0 3-2 3-5V44Z"
            fill="#b9861f"
            stroke="#251a10"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path
            d="M69 44v18c0 5-2 8-5 8-2 0-3-2-3-5V44Z"
            fill="#b9861f"
            stroke="#251a10"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path
            d="M28 43a22 22 0 0 1 44 0Z"
            fill="#b9861f"
            stroke="#251a10"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path d="M23 43h54" stroke="#251a10" strokeWidth="4" strokeLinecap="round" />
          <path
            d="M50 2c-13 0-22 10-25 25h50C72 12 63 2 50 2Z"
            fill="#b23a2e"
            stroke="#251a10"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path d="M41 8v17M50 4v21M59 8v17" stroke="#251a10" strokeWidth="2" opacity=".45" />
        </>
      )
    case 'a-patricienne':
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#f1d9ab" />
          <path
            d="M12 100c3-17 17-27 38-27s35 10 38 27Z"
            fill="#2c5b82"
            stroke="#251a10"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path
            d="M46 76c-5 7-6 16-5 24"
            stroke="#fbf6e9"
            strokeWidth="3.5"
            fill="none"
            opacity=".75"
          />
          <rect
            x="43"
            y="62"
            width="14"
            height="14"
            fill="#e8bd92"
            stroke="#251a10"
            strokeWidth="3.5"
          />
          <circle cx="50" cy="25" r="9" fill="#4a3320" stroke="#251a10" strokeWidth="3" />
          <circle cx="50" cy="50" r="23" fill="#4a3320" stroke="#251a10" strokeWidth="3.5" />
          <circle cx="50" cy="53" r="19" fill="#e8bd92" stroke="#251a10" strokeWidth="3.5" />
          <circle cx="43" cy="52" r="2.8" fill="#251a10" />
          <circle cx="57" cy="52" r="2.8" fill="#251a10" />
          <path
            d="M46 63c2.5 2 5.5 2 8 0"
            stroke="#251a10"
            strokeWidth="2.8"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M33 42c4-8 10-12 17-12s13 4 17 12c-4-4-10-6-17-6s-13 2-17 6Z"
            fill="#4a3320"
            stroke="#251a10"
            strokeWidth="3"
          />
          <g fill="#3f6b3c" stroke="#251a10" strokeWidth="2">
            <ellipse cx="50" cy="19" rx="5" ry="9" transform="rotate(-72 50 50)" />
            <ellipse cx="50" cy="19" rx="5" ry="9" transform="rotate(-56 50 50)" />
            <ellipse cx="50" cy="19" rx="5" ry="9" transform="rotate(-40 50 50)" />
            <ellipse cx="50" cy="19" rx="5" ry="9" transform="rotate(-24 50 50)" />
            <ellipse cx="50" cy="19" rx="5" ry="9" transform="rotate(24 50 50)" />
            <ellipse cx="50" cy="19" rx="5" ry="9" transform="rotate(40 50 50)" />
            <ellipse cx="50" cy="19" rx="5" ry="9" transform="rotate(56 50 50)" />
            <ellipse cx="50" cy="19" rx="5" ry="9" transform="rotate(72 50 50)" />
          </g>
          <circle cx="50" cy="20" r="5" fill="#b9861f" stroke="#251a10" strokeWidth="2.5" />
        </>
      )
    case 'a-legionnaire':
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#f1d9ab" />
          <path
            d="M12 100c3-17 17-27 38-27s35 10 38 27Z"
            fill="#2c5b82"
            stroke="#251a10"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <rect
            x="43"
            y="62"
            width="14"
            height="14"
            fill="#e8bd92"
            stroke="#251a10"
            strokeWidth="3.5"
          />
          <circle cx="50" cy="54" r="19" fill="#e8bd92" stroke="#251a10" strokeWidth="3.5" />
          <circle cx="43" cy="53" r="2.8" fill="#251a10" />
          <circle cx="57" cy="53" r="2.8" fill="#251a10" />
          <path d="M45 64h10" stroke="#251a10" strokeWidth="3" strokeLinecap="round" />
          <path
            d="M32 48v15c0 5 2 8 5 8 2 0 3-2 3-5V48Z"
            fill="#b9861f"
            stroke="#251a10"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path
            d="M68 48v15c0 5-2 8-5 8-2 0-3-2-3-5V48Z"
            fill="#b9861f"
            stroke="#251a10"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path
            d="M29 47a21 21 0 0 1 42 0Z"
            fill="#b9861f"
            stroke="#251a10"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          <path d="M24 47h52" stroke="#251a10" strokeWidth="4" strokeLinecap="round" />
          <path
            d="M46 47h8v13c0 3-2 4-4 4s-4-1-4-4Z"
            fill="#b9861f"
            stroke="#251a10"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </>
      )
    case 'b-casque-aile':
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#fbf6e9" />
          <g fill="#b23a2e">
            <path d="M50 14c-15 0-25 12-25 28v10h50V42c0-16-10-28-25-28Z" />
            <rect x="19" y="50" width="62" height="10" rx="5" />
            <path d="M45 59h10v18c0 4-2 6-5 6s-5-2-5-6Z" />
            <path d="M26 40 7 31c-2 5-2 10 0 13-3 2-5 5-5 9l24 3Z" />
            <path d="M74 40 93 31c2 5 2 10 0 13 3 2 5 5 5 9l-24 3Z" />
          </g>
          <path d="M50 20v30" stroke="#fbf6e9" strokeWidth="3.5" />
          <path d="M38 34a12 12 0 0 1 24 0" fill="none" stroke="#fbf6e9" strokeWidth="3" opacity=".5" />
        </>
      )
    case 'b-menhir':
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#fbf6e9" />
          <path
            d="M41 9 61 14C71 17 76 24 74 34L68 72C66 82 60 87 50 87C39 87 33 82 32 72L27 30C26 19 31 10 41 9Z"
            fill="#3f6b3c"
          />
          <g stroke="#fbf6e9" strokeWidth="3.2" strokeLinecap="round" opacity=".45" fill="none">
            <path d="M37 26l8 11M58 40l8 8M36 54l10 8M54 68l8 7" />
          </g>
          <path d="M18 92h64" stroke="#3f6b3c" strokeWidth="6" strokeLinecap="round" />
        </>
      )
    case 'b-sanglier':
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#fbf6e9" />
          <g fill="#8c5a2b">
            <path d="M22 54C22 42 32 34 46 34C56 34 64 38 69 44L82 47C90 49 91 61 83 64L70 67C65 73 56 77 46 77C32 77 22 68 22 58Z" />
            <path d="M34 36 37 29 41 34 45 27 49 33 54 28 57 35Z" />
            <polygon points="52,32 63,40 48,43" />
            <path d="M73 60C70 52 72 44 78 41C75 47 76 54 78 59Z" />
            <rect x="30" y="73" width="10" height="14" rx="5" />
            <rect x="43" y="74" width="10" height="14" rx="5" />
            <rect x="56" y="71" width="10" height="15" rx="5" />
            <path d="M21 50c-8-3-13 3-10 9 3-5 6-7 10-6Z" />
          </g>
          <circle cx="67" cy="51" r="3" fill="#fbf6e9" />
          <circle cx="85" cy="56" r="2.4" fill="#fbf6e9" />
        </>
      )
    case 'b-cimier':
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#fbf6e9" />
          <g fill="#2c5b82">
            <path d="M50 5c-13 0-22 10-25 25h50C72 15 63 5 50 5Z" />
            <path d="M50 26c-15 0-26 11-26 25v5h52v-5c0-14-11-25-26-25Z" />
            <rect x="20" y="55" width="60" height="9" rx="4" />
            <path d="M23 63h20l-3 17c-1 6-6 9-10 7-4-2-6-7-6-13Z" />
            <path d="M77 63H57l3 17c1 6 6 9 10 7 4-2 6-7 6-13Z" />
            <path d="M45 63h10v20c0 4-2 6-5 6s-5-2-5-6Z" />
          </g>
          <g stroke="#fbf6e9" fill="none">
            <path d="M50 8v22" strokeWidth="3.5" />
            <path d="M40 13v17M60 13v17" strokeWidth="2.5" opacity=".6" />
            <path d="M50 31v24" strokeWidth="3" />
          </g>
        </>
      )
    case 'b-aigle':
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#fbf6e9" />
          <g fill="#b9861f">
            <path d="M42 44 12 31l7 14-7 5 30 12Z" />
            <path d="M58 44 88 31l-7 14 7 5-30 12Z" />
            <path d="M50 30c-5 0-9 4-9 9l2 22c0 4 3 7 7 7s7-3 7-7l2-22c0-5-4-9-9-9Z" />
            <circle cx="50" cy="26" r="8" />
            <polygon points="57,23 69,27 57,31" />
            <rect x="46" y="66" width="8" height="28" rx="2" />
            <rect x="32" y="70" width="36" height="6" rx="3" />
          </g>
          <circle cx="47" cy="24" r="2.2" fill="#fbf6e9" />
        </>
      )
    case 'b-bouclier':
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#fbf6e9" />
          <rect x="22" y="13" width="56" height="74" rx="18" fill="#b23a2e" />
          <rect
            x="29"
            y="20"
            width="42"
            height="60"
            rx="13"
            fill="none"
            stroke="#fbf6e9"
            strokeWidth="3"
            opacity=".65"
          />
          <g fill="#fbf6e9">
            <polygon points="50,27 44,39 56,39" />
            <polygon points="50,73 44,61 56,61" />
            <polygon points="41,50 28,42 28,58" />
            <polygon points="59,50 72,42 72,58" />
            <circle cx="50" cy="50" r="8.5" />
          </g>
        </>
      )
    case 'c-torque':
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#8c5a2b" />
          <path d="M50 0A50 50 0 0 0 0 50Z" fill="#b0803f" opacity=".5" />
          <circle cx="50" cy="50" r="43" fill="#9c6a33" />
          <circle
            cx="50"
            cy="50"
            r="46.5"
            fill="none"
            stroke="#6f4620"
            strokeWidth="3"
            strokeDasharray="2 5.3"
            strokeLinecap="round"
          />
          <path
            d="M36 76A26 26 0 1 1 64 76"
            fill="none"
            stroke="#4d2f12"
            strokeWidth="9"
            strokeLinecap="butt"
          />
          <circle cx="36" cy="76" r="7.5" fill="#4d2f12" />
          <circle cx="64" cy="76" r="7.5" fill="#4d2f12" />
        </>
      )
    case 'c-lyre':
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#8c5a2b" />
          <path d="M50 0A50 50 0 0 0 0 50Z" fill="#b0803f" opacity=".5" />
          <circle cx="50" cy="50" r="43" fill="#9c6a33" />
          <circle
            cx="50"
            cy="50"
            r="46.5"
            fill="none"
            stroke="#6f4620"
            strokeWidth="3"
            strokeDasharray="2 5.3"
            strokeLinecap="round"
          />
          <g stroke="#4d2f12" fill="none" strokeLinecap="round">
            <path d="M42 40h16" strokeWidth="2.5" />
            <path d="M42 72c-11-6-16-20-10-32" strokeWidth="7" />
            <path d="M58 72c11-6 16-20 10-32" strokeWidth="7" />
            <path d="M30 32h40" strokeWidth="7" />
            <path d="M40 74h20" strokeWidth="7" />
            <g strokeWidth="2.6" opacity=".85">
              <path d="M43 36v36M50 34v38M57 36v36" />
            </g>
          </g>
        </>
      )
    case 'c-enseigne':
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#8c5a2b" />
          <path d="M50 0A50 50 0 0 0 0 50Z" fill="#b0803f" opacity=".5" />
          <circle cx="50" cy="50" r="43" fill="#9c6a33" />
          <circle
            cx="50"
            cy="50"
            r="46.5"
            fill="none"
            stroke="#6f4620"
            strokeWidth="3"
            strokeDasharray="2 5.3"
            strokeLinecap="round"
          />
          <g fill="#4d2f12">
            <rect x="46.5" y="16" width="7" height="70" rx="2" />
            <rect x="26" y="32" width="48" height="7" rx="3.5" />
            <rect x="28" y="43" width="44" height="28" rx="2" />
            <rect x="31" y="73" width="5" height="9" rx="2.5" />
            <rect x="41" y="73" width="5" height="9" rx="2.5" />
            <rect x="51" y="73" width="5" height="9" rx="2.5" />
            <rect x="61" y="73" width="5" height="9" rx="2.5" />
            <circle cx="50" cy="19" r="9" />
          </g>
          <circle cx="50" cy="19" r="4" fill="#9c6a33" />
          <g stroke="#9c6a33" strokeWidth="3" opacity=".8">
            <path d="M34 51h32M34 61h32" />
          </g>
        </>
      )
    case 'c-sceau':
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#8c5a2b" />
          <path d="M50 0A50 50 0 0 0 0 50Z" fill="#b0803f" opacity=".5" />
          <circle cx="50" cy="50" r="43" fill="#9c6a33" />
          <circle
            cx="50"
            cy="50"
            r="46.5"
            fill="none"
            stroke="#6f4620"
            strokeWidth="3"
            strokeDasharray="2 5.3"
            strokeLinecap="round"
          />
          <g fill="#4d2f12">
            <ellipse cx="50" cy="18" rx="4.6" ry="9" transform="rotate(-58 50 50)" />
            <ellipse cx="50" cy="18" rx="4.6" ry="9" transform="rotate(-89 50 50)" />
            <ellipse cx="50" cy="18" rx="4.6" ry="9" transform="rotate(-120 50 50)" />
            <ellipse cx="50" cy="18" rx="4.6" ry="9" transform="rotate(-151 50 50)" />
            <ellipse cx="50" cy="18" rx="4.6" ry="9" transform="rotate(151 50 50)" />
            <ellipse cx="50" cy="18" rx="4.6" ry="9" transform="rotate(120 50 50)" />
            <ellipse cx="50" cy="18" rx="4.6" ry="9" transform="rotate(89 50 50)" />
            <ellipse cx="50" cy="18" rx="4.6" ry="9" transform="rotate(58 50 50)" />
          </g>
          <text
            x="50"
            y="64"
            textAnchor="middle"
            fill="#4d2f12"
            fontFamily="Georgia, 'Times New Roman', serif"
            fontSize="42"
            fontWeight="700"
          >
            {initial}
          </text>
        </>
      )
    default:
      return null
  }
}
