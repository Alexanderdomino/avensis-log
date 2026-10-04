import type { Trip } from '../types'

/** Problem rate for a set of trips, with a Wilson 95 % confidence interval. */
export interface RateStat {
  /** Number of trips rated "Hakker" or "Ingen power" (or, for shares, the matching count). */
  problems: number
  total: number
  /** problems / total, or null when total is 0. */
  rate: number | null
  /** Wilson 95 % interval bounds; null when total is 0. */
  low: number | null
  high: number | null
  /** total ≥ the minimum sample size from settings. Below it the UI shows "for få ture". */
  sufficient: boolean
}

export const Z95 = 1.959964

/**
 * Wilson score interval for k successes in n trials. Unlike the naive p ± z·√(p(1−p)/n)
 * it stays inside [0, 1] and is still informative at 0/n and n/n.
 */
export function wilson(k: number, n: number, z = Z95): { low: number; high: number } | null {
  if (n <= 0) return null
  const p = k / n
  const z2 = z * z
  const denom = 1 + z2 / n
  const center = (p + z2 / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom
  return {
    low: k === 0 ? 0 : Math.max(0, center - half),
    high: k === n ? 1 : Math.min(1, center + half),
  }
}

export function rateStat(problems: number, total: number, minSample: number): RateStat {
  const ci = wilson(problems, total)
  return {
    problems,
    total,
    rate: total > 0 ? problems / total : null,
    low: ci?.low ?? null,
    high: ci?.high ?? null,
    sufficient: total > 0 && total >= minSample,
  }
}

export const isProblem = (t: Pick<Trip, 'rating'>): boolean => t.rating !== 'good'

export function problemRate(trips: Pick<Trip, 'rating'>[], minSample: number): RateStat {
  return rateStat(trips.filter(isProblem).length, trips.length, minSample)
}

/** True if the two confidence intervals overlap (or either is missing) → difference is not conclusive. */
export function intervalsOverlap(a: RateStat, b: RateStat): boolean {
  if (a.low == null || a.high == null || b.low == null || b.high == null) return true
  return a.low <= b.high && b.low <= a.high
}

/** "58 %" — Danish style with a space before the percent sign. */
export function formatPct(rate: number | null): string {
  if (rate == null) return '–'
  return `${Math.round(rate * 100)} %`
}

/** "58 % (7/12)" */
export function formatRate(s: RateStat): string {
  return `${formatPct(s.rate)} (${s.problems}/${s.total})`
}
