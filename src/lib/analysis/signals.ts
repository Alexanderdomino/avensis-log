import type { TripContext } from './derive'
import type { Grouping } from './groupings'
import { formatRate, intervalsOverlap, isProblem, rateStat, type RateStat } from './stats'

export interface Signal {
  groupingId: string
  groupKey: string
  groupLabel: string
  /** Problem rate for trips in the group. */
  group: RateStat
  /** Problem rate for all other classified trips in the same factor. */
  rest: RateStat
  /** group.rate − rest.rate (positive = more problems in the group). */
  diff: number
  /** True when the two Wilson intervals overlap, i.e. the difference may well be chance. */
  overlapping: boolean
  /** Plain Danish sentence. */
  text: string
}

export function phraseSignal(phrase: string, group: RateStat, rest: RateStat): string {
  const direction = (group.rate ?? 0) >= (rest.rate ?? 0) ? 'oftere' : 'sjældnere'
  return `Hakker ${direction} ${phrase}: ${formatRate(group)} mod ${formatRate(rest)}`
}

/**
 * Rank factors by how much the problem rate in one group differs from the rest of the trips
 * in that factor. Only groups where both sides reach `minSample` are considered, and each
 * factor contributes at most its single strongest group (a two-group factor would otherwise
 * produce the same signal twice, mirrored). These are correlations, not causes.
 */
export function strongestSignals(
  contexts: TripContext[],
  groupings: Grouping[],
  minSample: number,
  max = 5,
): Signal[] {
  const best: Signal[] = []
  for (const grouping of groupings) {
    const keyed = contexts
      .map((c) => ({ key: grouping.keyOf(c), problem: isProblem(c.trip) }))
      .filter((k): k is { key: string; problem: boolean } => k.key != null)
    let top: Signal | null = null
    for (const g of grouping.groups) {
      const inGroup = keyed.filter((k) => k.key === g.key)
      const rest = keyed.filter((k) => k.key !== g.key)
      if (inGroup.length < minSample || rest.length < minSample) continue
      const gs = rateStat(inGroup.filter((k) => k.problem).length, inGroup.length, minSample)
      const rs = rateStat(rest.filter((k) => k.problem).length, rest.length, minSample)
      const diff = (gs.rate ?? 0) - (rs.rate ?? 0)
      if (diff === 0) continue
      const candidate: Signal = {
        groupingId: grouping.id,
        groupKey: g.key,
        groupLabel: g.label,
        group: gs,
        rest: rs,
        diff,
        overlapping: intervalsOverlap(gs, rs),
        text: phraseSignal(g.phrase, gs, rs),
      }
      if (!top || Math.abs(diff) > Math.abs(top.diff)) top = candidate
    }
    if (top) best.push(top)
  }
  return best
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || b.group.total + b.rest.total - (a.group.total + a.rest.total))
    .slice(0, max)
}
