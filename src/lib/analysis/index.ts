import type { CarEvent, Settings, Trip } from '../types'
import { beforeAfter, type BeforeAfterRow } from './beforeAfter'
import { buildTripContexts, type TripContext } from './derive'
import { buildGroupings, groupProblemRates, situationShares, type GroupingResult, type SituationShare } from './groupings'
import { oilConsumption, type OilResult } from './oil'
import { strongestSignals, type Signal } from './signals'
import { problemRate, type RateStat } from './stats'

export * from './beforeAfter'
export * from './derive'
export * from './groupings'
export * from './oil'
export * from './signals'
export * from './stats'

export interface Analysis {
  contexts: TripContext[]
  overall: RateStat
  groupings: GroupingResult[]
  situations: SituationShare[]
  signals: Signal[]
  beforeAfter: BeforeAfterRow[]
  oil: OilResult
}

/** Run every analysis. Pure: same inputs → same output, no I/O. */
export function analyze(trips: Trip[], events: CarEvent[], settings: Settings): Analysis {
  const { minSampleSize: min, eventTypes } = settings
  const contexts = buildTripContexts(trips, events, eventTypes)
  const groupings = buildGroupings(eventTypes)
  return {
    contexts,
    overall: problemRate(trips, min),
    groupings: groupings.map((g) => groupProblemRates(contexts, g, min)),
    situations: situationShares(contexts, min),
    signals: strongestSignals(contexts, groupings, min),
    beforeAfter: beforeAfter(trips, events, settings.beforeAfterWindow, min),
    oil: oilConsumption(trips, events, eventTypes),
  }
}
