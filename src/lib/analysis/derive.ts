import type { CarEvent, EngineState, EventKind, EventType, Trip, TripType } from '../types'

const HOUR = 3_600_000

export interface TripContext {
  trip: Trip
  /** EventType.id of the most recent fuel event at or before the trip, or null if none. */
  fuelTypeId: string | null
  fuelLabel: string | null
  /**
   * 1 for the first trip after injector cleaner was added, 2 for the next, …
   * null if no injector cleaner event precedes the trip.
   */
  tripsSinceInjectorCleaner: number | null
  /** Same counting, from the most recent fuel event. */
  tripsSinceFill: number | null
}

export const byTime = <T extends { timestamp: number }>(a: T, b: T) => a.timestamp - b.timestamp

export function kindOf(typeId: string, eventTypes: EventType[]): EventKind {
  return eventTypes.find((t) => t.id === typeId)?.kind ?? 'other'
}

export function labelOf(typeId: string, eventTypes: EventType[]): string {
  return eventTypes.find((t) => t.id === typeId)?.label ?? typeId
}

/**
 * Attach derived fields to every trip (sorted oldest first). An event at exactly the
 * same timestamp as a trip counts as happening before it (fill up, then drive).
 */
export function buildTripContexts(trips: Trip[], events: CarEvent[], eventTypes: EventType[]): TripContext[] {
  const sortedTrips = [...trips].sort(byTime)
  const sortedEvents = [...events].sort(byTime)
  let e = 0
  let fuel: string | null = null
  let sinceFill: number | null = null
  let sinceCleaner: number | null = null
  return sortedTrips.map((trip) => {
    while (e < sortedEvents.length && sortedEvents[e].timestamp <= trip.timestamp) {
      const ev = sortedEvents[e++]
      const kind = kindOf(ev.type, eventTypes)
      if (kind === 'fuel') {
        fuel = ev.type
        sinceFill = 0
      } else if (kind === 'injector_cleaner') {
        sinceCleaner = 0
      }
    }
    if (sinceFill != null) sinceFill++
    if (sinceCleaner != null) sinceCleaner++
    return {
      trip,
      fuelTypeId: fuel,
      fuelLabel: fuel ? labelOf(fuel, eventTypes) : null,
      tripsSinceInjectorCleaner: sinceCleaner,
      tripsSinceFill: sinceFill,
    }
  })
}

/**
 * Pre-selected engine state for a new (or edited) trip: warm if the previous trip
 * started less than `warmHours` before `timestamp`, otherwise cold.
 */
export function suggestEngineState(
  trips: Pick<Trip, 'id' | 'timestamp'>[],
  timestamp: number,
  warmHours: number,
  excludeId?: string,
): EngineState {
  let prev: number | null = null
  for (const t of trips) {
    if (t.id === excludeId || t.timestamp >= timestamp) continue
    if (prev == null || t.timestamp > prev) prev = t.timestamp
  }
  if (prev == null) return 'cold'
  return timestamp - prev < warmHours * HOUR ? 'warm' : 'cold'
}

/** Fuel type for the quick "Tanket" button: the last one used, else the first fuel type. */
export function lastFuelTypeId(events: CarEvent[], eventTypes: EventType[]): string | null {
  const fuelEvents = events.filter((e) => kindOf(e.type, eventTypes) === 'fuel').sort(byTime)
  if (fuelEvents.length > 0) return fuelEvents[fuelEvents.length - 1].type
  return eventTypes.find((t) => t.kind === 'fuel')?.id ?? null
}

/** Trip type of the most recent trip, so the chip defaults to what you usually drive. */
export function lastTripType(trips: Trip[]): TripType {
  if (trips.length === 0) return 'city'
  return trips.reduce((a, b) => (b.timestamp > a.timestamp ? b : a)).tripType
}
