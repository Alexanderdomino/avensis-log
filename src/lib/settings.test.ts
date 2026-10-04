import { describe, expect, it } from 'vitest'
import { analyze } from './analysis'
import { DEFAULT_EVENT_TYPES, DEFAULT_SETTINGS, withDefaults } from './defaults'
import { DAY, event, HOUR, settings, T0, trip, tripSeries, weather } from './test-fixtures'

describe('withDefaults', () => {
  it('returns defaults for a missing document', () => {
    expect(withDefaults(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps valid stored values and repairs invalid ones', () => {
    const s = withDefaults({ minSampleSize: 3, beforeAfterWindow: 0, warmEngineHours: Number.NaN as number, eventTypes: [] })
    expect(s.minSampleSize).toBe(3)
    expect(s.beforeAfterWindow).toBe(1)
    expect(s.warmEngineHours).toBe(2)
    expect(s.eventTypes).toBe(DEFAULT_EVENT_TYPES)
  })
})

describe('custom settings change the analysis', () => {
  const trips = [...tripSeries(4, 3, T0, { engine: 'cold' }), ...tripSeries(4, 0, T0 + DAY, { engine: 'warm' })]

  it('minimum sample size controls whether rates and signals are shown', () => {
    const strict = analyze(trips, [], settings({ minSampleSize: 5 }))
    expect(strict.overall.sufficient).toBe(true)
    expect(strict.groupings.find((g) => g.id === 'engine')!.groups.every((g) => !g.stat.sufficient)).toBe(true)
    expect(strict.signals).toEqual([])

    const loose = analyze(trips, [], settings({ minSampleSize: 4 }))
    expect(loose.groupings.find((g) => g.id === 'engine')!.groups.every((g) => g.stat.sufficient)).toBe(true)
    expect(loose.signals[0].text).toBe('Hakker oftere med kold motor: 75 % (3/4) mod 0 % (0/4)')
  })

  it('before/after window size controls how many trips are compared', () => {
    const ev = event({ timestamp: T0 + 12 * HOUR })
    expect(analyze(trips, [ev], settings({ beforeAfterWindow: 10 })).beforeAfter[0].before.total).toBe(4)
    expect(analyze(trips, [ev], settings({ beforeAfterWindow: 2 })).beforeAfter[0].before.total).toBe(2)
  })

  it('event types decide which events count as fuel', () => {
    const t = [trip({ timestamp: T0 + HOUR, weather: weather() })]
    const e = [event({ type: 'other', timestamp: T0 })]
    expect(analyze(t, e, settings()).contexts[0].fuelTypeId).toBeNull()
    const custom = settings({ eventTypes: DEFAULT_EVENT_TYPES.map((x) => (x.id === 'other' ? { ...x, kind: 'fuel' as const } : x)) })
    expect(analyze(t, e, custom).contexts[0].fuelTypeId).toBe('other')
  })

  it('produces a complete analysis object', () => {
    const a = analyze(trips, [event({ type: 'oil_topup' })], settings())
    expect(a.groupings.map((g) => g.id)).toEqual([
      'engine',
      'tripType',
      'weather',
      'dewSpread',
      'humidity',
      'temperature',
      'overnightMin',
      'fuel',
      'sinceFill',
      'sinceCleaner',
    ])
    expect(a.situations).toHaveLength(5)
    expect(a.oil.topups).toHaveLength(1)
    expect(a.overall).toMatchObject({ problems: 3, total: 8 })
  })
})
