import type { Rating } from '../lib/types'

/** Fixed status colors for ratings (always shown together with an icon/label). */
export const RATING_COLOR: Record<Rating, string> = {
  good: '#0ca30c',
  hesitates: '#fab219',
  no_power: '#d03b3b',
}

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}
