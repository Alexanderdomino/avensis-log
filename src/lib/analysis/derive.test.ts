import { describe, expect, it } from 'vitest'
import { DEFAULT_EVENT_TYPES } from '../defaults'
import { event, HOUR, T0, trip } from '../test-fixtures'
import type { EventType } from '../types'
import { buildTripContexts, lastFuelTypeId, lastTripType, suggestEngineState } from './derive'

const types = DEFAULT_EVENT_TYPES

describe('buildTripContexts', () => {
  it('derives fuel in tank from the most recent fuel event before the trip', () => {
    const trips = [
      trip({ id: 'a', timestamp: T0 }),
      trip({ id: 'b', timestamp: T0 + 2 * HOUR }),
      trip({ id: 'c', timestamp: T0 + 4 * HOUR }),
    ]
    const events = [
      event({ type: 'fuel_e10', timestamp: T0 + HOUR }),
      event({ type: 'oil_topup', timestamp: T0 + 2.5 * HOUR }), // non-fuel events don't change the tank
      event({ type: 'fuel_e5', timestamp: T0 + 3 * HOUR }),
    ]
    const ctx = buildTripContexts(trips, events, types)
    expect(ctx.map((c) => c.fuelTypeId)).toEqual([null, 'fuel_e10', 'fuel_e5'])
    expect(ctx.map((c) => c.fuelLabel)).toEqual([null, 'Benzin E10', 'Benzin E5'])
  })

  it('counts trips since last fill and since injector cleaner (1 = first trip after)', () => {
    const trips = [0, 1, 2, 3, 4, 5].map((i) => trip({ id: `t${i}`, timestamp: T0 + i * HOUR }))
    const events = [
      event({ type: 'fuel_e5', timestamp: T0 + 0.5 * HOUR }),
      event({ type: 'injector_cleaner', timestamp: T0 + 2.5 * HOUR }),
      event({ type: 'fuel_e10', timestamp: T0 + 3.5 * HOUR }),
    ]
    const ctx = buildTripContexts(trips, events, types)
    expect(ctx.map((c) => c.tripsSinceFill)).toEqual([null, 1, 2, 3, 1, 2])
    expect(ctx.map((c) => c.tripsSinceInjectorCleaner)).toEqual([null, null, null, 1, 2, 3])
  })

  it('treats an event at the same timestamp as the trip as before it', () => {
    const ctx = buildTripContexts([trip({ timestamp: T0 })], [event({ type: 'fuel_e10', timestamp: T0 })], types)
    expect(ctx[0].fuelTypeId).toBe('fuel_e10')
    expect(ctx[0].tripsSinceFill).toBe(1)
  })

  it('sorts unsorted input by time', () => {
    const ctx = buildTripContexts(
      [trip({ id: 'late', timestamp: T0 + 5 * HOUR }), trip({ id: 'early', timestamp: T0 })],
      [event({ type: 'fuel_e5', timestamp: T0 + HOUR })],
      types,
    )
    expect(ctx.map((c) => [c.trip.id, c.fuelTypeId])).toEqual([
      ['early', null],
      ['late', 'fuel_e5'],
    ])
  })

  it('uses custom event types from settings (custom fuel kind counts as fuel)', () => {
    const custom: EventType[] = [...types, { id: 'v_power', label: 'Shell V-Power 98', kind: 'fuel' }]
    const ctx = buildTripContexts([trip({ timestamp: T0 + HOUR })], [event({ type: 'v_power', timestamp: T0 })], custom)
    expect(ctx[0].fuelLabel).toBe('Shell V-Power 98')
    // With default types the unknown id is "other" and doesn't count as fuel.
    expect(buildTripContexts([trip({ timestamp: T0 + HOUR })], [event({ type: 'v_power', timestamp: T0 })], types)[0].fuelTypeId).toBeNull()
  })

  it('ignores events of unknown type', () => {
    const ctx = buildTripContexts([trip({ timestamp: T0 + HOUR })], [event({ type: 'deleted-type', timestamp: T0 })], types)
    expect(ctx[0]).toMatchObject({ fuelTypeId: null, tripsSinceFill: null })
  })
})

describe('suggestEngineState', () => {
  const prev = [trip({ id: 'p', timestamp: T0 })]

  it('is cold when there is no previous trip', () => {
    expect(suggestEngineState([], T0, 2)).toBe('cold')
  })

  it('is warm just under the threshold and cold at exactly the threshold', () => {
    expect(suggestEngineState(prev, T0 + 2 * HOUR - 60_000, 2)).toBe('warm')
    expect(suggestEngineState(prev, T0 + 2 * HOUR, 2)).toBe('cold')
  })

  it('respects the warm-engine hours setting', () => {
    expect(suggestEngineState(prev, T0 + 3 * HOUR, 2)).toBe('cold')
    expect(suggestEngineState(prev, T0 + 3 * HOUR, 4)).toBe('warm')
  })

  it('ignores later trips (for back-dated logging) and the trip being edited', () => {
    const trips = [trip({ id: 'p', timestamp: T0 }), trip({ id: 'later', timestamp: T0 + 5 * HOUR })]
    expect(suggestEngineState(trips, T0 + 10 * HOUR, 2)).toBe('cold')
    expect(suggestEngineState(trips, T0 + 6 * HOUR, 2)).toBe('warm')
    expect(suggestEngineState(trips, T0 + 6 * HOUR, 2, 'later')).toBe('cold')
  })

  it('uses the most recent previous trip, regardless of input order', () => {
    const trips = [trip({ id: 'b', timestamp: T0 + 9 * HOUR }), trip({ id: 'a', timestamp: T0 })]
    expect(suggestEngineState(trips, T0 + 10 * HOUR, 2)).toBe('warm')
  })
})

describe('defaults for quick logging', () => {
  it('pre-selects the last used fuel type, else the first fuel type', () => {
    expect(lastFuelTypeId([], types)).toBe('fuel_e5')
    const events = [event({ type: 'fuel_e10', timestamp: T0 + HOUR }), event({ type: 'fuel_e5', timestamp: T0 }), event({ type: 'oil_topup', timestamp: T0 + 2 * HOUR })]
    expect(lastFuelTypeId(events, types)).toBe('fuel_e10')
  })

  it('returns null if no fuel types are configured', () => {
    expect(lastFuelTypeId([], [{ id: 'x', label: 'X', kind: 'other' }])).toBeNull()
  })

  it('defaults trip type to the latest trip', () => {
    expect(lastTripType([])).toBe('city')
    expect(lastTripType([trip({ timestamp: T0 + HOUR, tripType: 'motorway' }), trip({ timestamp: T0, tripType: 'country' })])).toBe('motorway')
  })
})
