import { describe, expect, it } from 'vitest'
import { DEFAULT_EVENT_TYPES } from '../defaults'
import { DAY, T0, trip, tripSeries, weather } from '../test-fixtures'
import { buildTripContexts } from './derive'
import { buildGroupings } from './groupings'
import { phraseSignal, strongestSignals } from './signals'
import { rateStat } from './stats'

const groupings = buildGroupings(DEFAULT_EVENT_TYPES)
const signals = (trips: ReturnType<typeof trip>[], min = 5) =>
  strongestSignals(buildTripContexts(trips, [], DEFAULT_EVENT_TYPES), groupings, min)

describe('strongestSignals', () => {
  it('phrases the dew point example in plain Danish', () => {
    const trips = [
      ...tripSeries(12, 7, T0, { weather: weather({ dewPointSpread: 1 }) }),
      ...tripSeries(21, 3, T0 + DAY, { weather: weather({ dewPointSpread: 8 }) }),
    ]
    const s = signals(trips)
    expect(s).toHaveLength(1)
    expect(s[0].text).toBe('Hakker oftere når temp − dugpunkt er under 2 °C: 58 % (7/12) mod 14 % (3/21)')
    expect(s[0].groupingId).toBe('dewSpread')
    expect(s[0].overlapping).toBe(true)
  })

  it('phrases a lower rate with "sjældnere"', () => {
    expect(phraseSignal('på motorvej', rateStat(1, 10, 1), rateStat(5, 10, 1))).toBe('Hakker sjældnere på motorvej: 10 % (1/10) mod 50 % (5/10)')
  })

  it('ranks factors by absolute difference', () => {
    const trips = [
      // engine: cold 6/6 vs warm 0/6 → diff 1.0
      ...tripSeries(6, 6, T0, { engine: 'cold', tripType: 'city' }),
      ...tripSeries(6, 0, T0 + DAY, { engine: 'warm', tripType: 'city' }),
    ]
    // trip type: make motorway trips differ less (3/6 problems among warm/cold mixed)
    trips.push(...tripSeries(3, 2, T0 + 2 * DAY, { engine: 'cold', tripType: 'motorway' }))
    trips.push(...tripSeries(3, 0, T0 + 3 * DAY, { engine: 'warm', tripType: 'motorway' }))
    const s = signals(trips)
    expect(s.map((x) => x.groupingId)).toEqual(['engine', 'tripType'])
    expect(s[0].text).toMatch(/^Hakker oftere med kold motor: 89 % \(8\/9\) mod 0 % \(0\/9\)$/)
    expect(Math.abs(s[0].diff)).toBeGreaterThan(Math.abs(s[1].diff))
    expect(s[0].overlapping).toBe(false)
  })

  it('keeps at most one signal per factor', () => {
    const trips = [...tripSeries(6, 6, T0, { engine: 'cold' }), ...tripSeries(6, 0, T0 + DAY, { engine: 'warm' })]
    expect(signals(trips).filter((s) => s.groupingId === 'engine')).toHaveLength(1)
  })

  it('skips factors where either side is below the minimum sample', () => {
    const trips = [...tripSeries(4, 4, T0, { engine: 'cold' }), ...tripSeries(10, 0, T0 + DAY, { engine: 'warm' })]
    expect(signals(trips, 5)).toEqual([])
    expect(signals(trips, 4).map((s) => s.groupingId)).toEqual(['engine'])
  })

  it('ignores factors with no difference', () => {
    const trips = [...tripSeries(6, 3, T0, { engine: 'cold' }), ...tripSeries(6, 3, T0 + DAY, { engine: 'warm' })]
    expect(signals(trips)).toEqual([])
  })

  it('returns at most 5 signals', () => {
    const many = [
      ...tripSeries(10, 10, T0, { engine: 'cold', tripType: 'city', weather: weather({ dewPointSpread: 1, humidity: 95, temperature: -2, minTemp12h: -5 }) }),
      ...tripSeries(10, 0, T0 + DAY, { engine: 'warm', tripType: 'motorway', weather: weather({ dewPointSpread: 9, humidity: 50, temperature: 20, minTemp12h: 16 }) }),
    ]
    expect(signals(many)).toHaveLength(5)
  })
})
