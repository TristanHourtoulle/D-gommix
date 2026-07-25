/**
 * Repeated pawn watermark behind the live screen (maquette `.pawn-field`):
 * bronze pawn outlines tilted 12°, faded through `--pawn-opacity` so the
 * theme drives the intensity.
 */
export function PawnField() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      style={{ opacity: 'var(--pawn-opacity)', color: 'var(--bronze-strong)' }}
    >
      <defs>
        <pattern
          id="live-pawn-pattern"
          width="76"
          height="88"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(12)"
        >
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="square"
            transform="translate(14 14) scale(1.35)"
          >
            <path d="M10 9V9C10.316 11.8443 9.32202 14.678 7.29844 16.7016L6 18" />
            <path d="M7 9H17" />
            <path d="M18 18L16.7016 16.7016C14.678 14.678 13.684 11.8443 14 9V9" />
            <path d="M18.5 18H5.5C4.67157 18 4 18.6716 4 19.5V22H20V19.5C20 18.6716 19.3284 18 18.5 18Z" />
            <ellipse cx="12" cy="5" rx="3" ry="3" transform="rotate(90 12 5)" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#live-pawn-pattern)" />
    </svg>
  )
}
