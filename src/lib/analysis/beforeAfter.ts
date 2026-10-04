import type { CarEvent, Trip } from '../types'
import { byTime } from './derive'
import { intervalsOverlap, problemRate, type RateStat } from './stats'

export interface BeforeAfterRow {
  event: CarEvent
  before: RateStat
  after: RateStat
  /** after.rate − before.rate, or null if either side has no trips. */
  diff: number | null
  /**
   * Not conclusive when either side is below the minimum sample size or the
   * confidence intervals overlap.
   */
  inconclusive: boolean
  reason: 'few_trips' | 'overlap' | null
}

/**
 * Problem rate in the `window` trips immediately before each event vs the `window` trips
 * immediately after it. Near the start/end of the data the windows are simply shorter.
 * A trip at exactly the event's timestamp counts as "after".
 */
export function beforeAfter(trips: Trip[], events: CarEvent[], window: number, minSample: number): BeforeAfterRow[] {
  const sorted = [...trips].sort(byTime)
  return [...events].sort(byTime).map((event) => {
    const firstAfter = sorted.findIndex((t) => t.timestamp >= event.timestamp)
    const split = firstAfter === -1 ? sorted.length : firstAfter
    const beforeTrips = sorted.slice(Math.max(0, split - window), split)
    const afterTrips = sorted.slice(split, split + window)
    const before = problemRate(beforeTrips, minSample)
    const after = problemRate(afterTrips, minSample)
    const few = !before.sufficient || !after.sufficient
    const overlap = intervalsOverlap(before, after)
    return {
      event,
      before,
      after,
      diff: before.rate != null && after.rate != null ? after.rate - before.rate : null,
      inconclusive: few || overlap,
      reason: few ? 'few_trips' : overlap ? 'overlap' : null,
    }
  })
}
