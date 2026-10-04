import type { Rating } from '../lib/types'

/** Dashboard-style warning-light glyphs. */
export function RatingIcon({ rating, className = 'h-9 w-9' }: { rating: Rating; className?: string }) {
  const common = { className, viewBox: '0 0 48 48', fill: 'none', stroke: 'currentColor', strokeWidth: 3.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (rating === 'good')
    return (
      <svg {...common}>
        <circle cx="24" cy="24" r="18" />
        <path d="M15 24.5l6 6 12-13" />
      </svg>
    )
  if (rating === 'hesitates')
    // Check-engine lamp
    return (
      <svg {...common}>
        <path d="M6 30v-9h4l3-5h15l4 5h5v5h3v-4h3v12h-3v-4h-3v5h-5l-4 4H16l-3-4H9v-5z" />
      </svg>
    )
  return (
    <svg {...common}>
      <path d="M24 5L3 42h42z" />
      <path d="M24 18v12" />
      <circle cx="24" cy="36" r="0.5" fill="currentColor" />
    </svg>
  )
}
