import { describe, expect, it } from 'vitest'
import { DEFAULT_EVENT_TYPES } from '../defaults'
import { event, HOUR, T0, trip, weather } from '../test-fixtures'
import type { Trip } from '../types'
import { buildTripContexts } from './derive'
import {
  buildGroupings,
  dewSpreadBand,
  groupProblemRates,
  humidityBand,
  sinceBand,
  situationShares,
  tempBand,
  weatherCondition,
} from './groupings'

describe('band boundaries', () => {
  it('dew point spread: <2, 2–5, >5', () => {
    expect(dewSpreadBand(-0.5)).toBe('lt2')
    expect(dewSpreadBand(1.9)).toBe('lt2')
    expect(dewSpreadBand(2)).toBe('2to5')
    expect(dewSpreadBand(5)).toBe('2to5')
    expect(dewSpreadBand(5.1)).toBe('gt5')
  })

  it('relative humidity: <70, 70–89, ≥90', () => {
    expect(humidityBand(69.9)).toBe('lt70')
    expect(humidityBand(70)).toBe('70to89')
    expect(humidityBand(89.9)).toBe('70to89')
    expect(humidityBand(90)).toBe('gte90')
    expect(humidityBand(100)).toBe('gte90')
  })

  it('temperature: <0, 0–7, 8–14, 15+', () => {
    expect(tempBand(-0.1)).toBe('lt0')
    expect(tempBand(0)).toBe('0to7')
    expect(tempBand(7.9)).toBe('0to7')
    expect(tempBand(8)).toBe('8to14')
    expect(tempBand(14.9)).toBe('8to14')
    expect(tempBand(15)).toBe('gte15')
  })

  it('trips since event: 1–5, 6–15, 16+', () => {
    expect(sinceBand(1)).toBe('1to5')
    expect(sinceBand(5)).toBe('1to5')
    expect(sinceBand(6)).toBe('6to15')
    expect(sinceBand(15)).toBe('6to15')
    expect(sinceBand(16)).toBe('gte16')
  })

  it('weather condition: rain beats damp beats dry', () => {
    expect(weatherCondition(weather())).toBe('dry')
    expect(weatherCondition(weather({ precip12h: 0.2 }))).toBe('rain')
    expect(weatherCondition(weather({ precip12h: 0.1 }))).toBe('dry')
    expect(weatherCondition(weather({ precipitation: 0.1 }))).toBe('rain')
    expect(weatherCondition(weather({ weatherCode: 61 }))).toBe('rain')
    expect(weatherCondition(weather({ weatherCode: 45 }))).toBe('damp')
    expect(weatherCondition(weather({ humidity: 90 }))).toBe('damp')
    expect(weatherCondition(weather({ humidity: 89 }))).toBe('dry')
    expect(weatherCondition(weather({ humidity: 95, precip12h: 3 }))).toBe('rain')
  })
})

const groupings = buildGroupings(DEFAULT_EVENT_TYPES)
const run = (id: string, trips: Trip[], events = [] as Parameters<typeof buildTripContexts>[1], min = 1) => {
  const g = groupings.find((x) => x.id === id)!
  return groupProblemRates(buildTripContexts(trips, events, DEFAULT_EVENT_TYPES), g, min)
}
const byKey = (r: ReturnType<typeof run>) => Object.fromEntries(r.groups.map((g) => [g.key, [g.stat.problems, g.stat.total]]))

describe('groupProblemRates', () => {
  it('engine cold/warm', () => {
    const r = run('engine', [trip({ engine: 'cold', rating: 'hesitates' }), trip({ engine: 'cold' }), trip({ engine: 'warm' })])
    expect(byKey(r)).toEqual({ cold: [1, 2], warm: [0, 1] })
  })

  it('trip type', () => {
    const r = run('tripType', [trip({ tripType: 'motorway', rating: 'no_power' }), trip({ tripType: 'country' })])
    expect(byKey(r)).toEqual({ city: [0, 0], country: [0, 1], motorway: [1, 1] })
  })

  it('weather, excluding trips whose weather is still pending', () => {
    const r = run('weather', [
      trip({ weather: weather({ precip12h: 4 }), rating: 'hesitates' }),
      trip({ weather: weather({ weatherCode: 48 }) }),
      trip(),
      trip({ weatherStatus: 'pending', weather: null }),
    ])
    expect(byKey(r)).toEqual({ dry: [0, 1], rain: [1, 1], damp: [0, 1] })
    expect(r.unclassified).toBe(1)
  })

  it('dew point spread bands at the boundaries', () => {
    const r = run('dewSpread', [
      trip({ weather: weather({ dewPointSpread: 1.9 }), rating: 'hesitates' }),
      trip({ weather: weather({ dewPointSpread: 2 }) }),
      trip({ weather: weather({ dewPointSpread: 5 }) }),
      trip({ weather: weather({ dewPointSpread: 5.1 }) }),
    ])
    expect(byKey(r)).toEqual({ lt2: [1, 1], '2to5': [0, 2], gt5: [0, 1] })
  })

  it('humidity bands', () => {
    const r = run('humidity', [trip({ weather: weather({ humidity: 69 }) }), trip({ weather: weather({ humidity: 70 }) }), trip({ weather: weather({ humidity: 90 }), rating: 'hesitates' })])
    expect(byKey(r)).toEqual({ lt70: [0, 1], '70to89': [0, 1], gte90: [1, 1] })
  })

  it('temperature bands', () => {
    const r = run('temperature', [-1, 0, 7, 8, 14, 15].map((t) => trip({ weather: weather({ temperature: t }) })))
    expect(byKey(r)).toEqual({ lt0: [0, 1], '0to7': [0, 2], '8to14': [0, 2], gte15: [0, 1] })
  })

  it('overnight minimum temperature bands use minTemp12h, not the current temperature', () => {
    const r = run('overnightMin', [trip({ weather: weather({ temperature: 12, minTemp12h: -3 }), rating: 'hesitates' }), trip({ weather: weather({ temperature: 12, minTemp12h: 9 }) })])
    expect(byKey(r)).toEqual({ lt0: [1, 1], '0to7': [0, 0], '8to14': [0, 1], gte15: [0, 0] })
  })

  it('fuel currently in the tank (trips before any fill are unclassified)', () => {
    const r = run(
      'fuel',
      [trip({ timestamp: T0 }), trip({ timestamp: T0 + 2 * HOUR, rating: 'hesitates' }), trip({ timestamp: T0 + 4 * HOUR })],
      [event({ type: 'fuel_e10', timestamp: T0 + HOUR }), event({ type: 'fuel_e5', timestamp: T0 + 3 * HOUR })],
    )
    expect(byKey(r)).toEqual({ fuel_e5: [0, 1], fuel_e10: [1, 1] })
    expect(r.unclassified).toBe(1)
  })

  it('trips since fill and since injector cleaner', () => {
    const trips = Array.from({ length: 17 }, (_, i) => trip({ timestamp: T0 + (i + 1) * HOUR }))
    const events = [event({ type: 'fuel_e5', timestamp: T0 }), event({ type: 'injector_cleaner', timestamp: T0 + 1.5 * HOUR })]
    expect(byKey(run('sinceFill', trips, events))).toEqual({ '1to5': [0, 5], '6to15': [0, 10], gte16: [0, 2] })
    expect(byKey(run('sinceCleaner', trips, events))).toEqual({ none: [0, 1], '1to5': [0, 5], '6to15': [0, 10], gte16: [0, 1] })
  })

  it('flags groups below the minimum sample size', () => {
    const r = run('engine', [trip({ engine: 'cold' }), trip({ engine: 'warm' }), trip({ engine: 'warm' })], [], 2)
    expect(r.groups.map((g) => g.stat.sufficient)).toEqual([false, true])
  })

  it('creates a fuel group per fuel event type in settings', () => {
    const custom = buildGroupings([...DEFAULT_EVENT_TYPES, { id: 'diesel', label: 'Diesel', kind: 'fuel' }])
    expect(custom.find((g) => g.id === 'fuel')!.groups.map((g) => g.key)).toEqual(['fuel_e5', 'fuel_e10', 'diesel'])
  })
})

describe('situationShares ("when did it happen")', () => {
  it('reports the share of problem trips mentioning each situation', () => {
    const ctx = buildTripContexts(
      [
        trip({ rating: 'hesitates', situations: ['acceleration', 'cold_start'] }),
        trip({ rating: 'no_power', situations: ['acceleration'] }),
        trip({ rating: 'hesitates', situations: [] }),
        trip({ rating: 'good' }),
      ],
      [],
      DEFAULT_EVENT_TYPES,
    )
    const s = Object.fromEntries(situationShares(ctx, 1).map((x) => [x.situation, [x.stat.problems, x.stat.total]]))
    expect(s).toEqual({ acceleration: [2, 3], uphill: [0, 3], steady: [0, 3], idle: [0, 3], cold_start: [1, 3] })
  })
})
