import { describe, expect, it } from 'vitest'
import { DEFAULT_EVENT_TYPES } from '../defaults'
import { DAY, event, T0, trip } from '../test-fixtures'
import { odometerAt, odometerReadings, oilConsumption } from './oil'

const types = DEFAULT_EVENT_TYPES

describe('odometerAt', () => {
  const readings = [
    { timestamp: T0, km: 100_000 },
    { timestamp: T0 + 10 * DAY, km: 101_000 },
  ]
  it('uses the own reading when present', () => {
    expect(odometerAt(T0 + 5 * DAY, readings, 123)).toBe(123)
  })
  it('interpolates linearly by time between readings on both sides', () => {
    expect(odometerAt(T0 + 5 * DAY, readings)).toBe(100_500)
  })
  it('returns null with a reading on only one side', () => {
    expect(odometerAt(T0 - DAY, readings)).toBeNull()
    expect(odometerAt(T0 + 11 * DAY, readings)).toBeNull()
    expect(odometerAt(T0, [])).toBeNull()
  })
  it('collects readings from trips and events, skipping missing ones', () => {
    const r = odometerReadings([trip({ odometer: 5, timestamp: T0 + DAY }), trip({ odometer: null })], [event({ odometer: 1, timestamp: T0 })])
    expect(r).toEqual([
      { timestamp: T0, km: 1 },
      { timestamp: T0 + DAY, km: 5 },
    ])
  })
})

describe('oilConsumption', () => {
  it('computes L/1000 km per interval, rolling and overall', () => {
    const events = [
      event({ id: 'chg', type: 'oil_change', timestamp: T0, odometer: 100_000 }),
      event({ id: 'a', type: 'oil_topup', timestamp: T0 + 10 * DAY, odometer: 101_000, liters: 0.5 }),
      event({ id: 'b', type: 'oil_topup', timestamp: T0 + 20 * DAY, odometer: 103_000, liters: 1.5 }),
    ]
    const r = oilConsumption([], events, types)
    expect(r.intervals.map((i) => i.rate)).toEqual([0.5, 0.75])
    expect(r.intervals[1].rolling).toBeCloseTo((2 / 3000) * 1000)
    expect(r.overall).toBeCloseTo((2 / 3000) * 1000)
  })

  it('reports "not enough data" for the first top-up without a previous reference', () => {
    const r = oilConsumption([], [event({ type: 'oil_topup', odometer: 100_000, liters: 0.5 })], types)
    expect(r.topups).toHaveLength(1)
    expect(r.topups[0].interval).toBeNull()
    expect(r.overall).toBeNull()
  })

  it('interpolates a missing top-up odometer from trips on both sides', () => {
    const trips = [trip({ timestamp: T0 + 9 * DAY, odometer: 100_900 }), trip({ timestamp: T0 + 11 * DAY, odometer: 101_100 })]
    const events = [
      event({ type: 'oil_change', timestamp: T0, odometer: 100_000 }),
      event({ type: 'oil_topup', timestamp: T0 + 10 * DAY, liters: 0.5 }),
    ]
    const r = oilConsumption(trips, events, types)
    expect(r.intervals[0]).toMatchObject({ fromKm: 100_000, toKm: 101_000 })
    expect(r.overall).toBeCloseTo(0.5)
  })

  it('gives "not enough data" when the odometer can only be bracketed on one side', () => {
    const trips = [trip({ timestamp: T0 + 9 * DAY, odometer: 100_900 })]
    const events = [
      event({ type: 'oil_change', timestamp: T0, odometer: 100_000 }),
      event({ type: 'oil_topup', timestamp: T0 + 10 * DAY, liters: 0.5 }),
    ]
    const r = oilConsumption(trips, events, types)
    expect(r.topups[0].interval).toBeNull()
    expect(r.overall).toBeNull()
  })

  it('skips top-ups without liters and non-increasing odometers', () => {
    const events = [
      event({ type: 'oil_change', timestamp: T0, odometer: 100_000 }),
      event({ type: 'oil_topup', timestamp: T0 + DAY, odometer: 100_500, liters: null }),
      event({ type: 'oil_topup', timestamp: T0 + 2 * DAY, odometer: 100_400, liters: 0.3 }),
    ]
    const r = oilConsumption([], events, types)
    expect(r.topups.map((t) => t.interval)).toEqual([null, null])
  })

  it('treats a custom oil top-up type like the default one', () => {
    const custom = [...types, { id: 'my_oil', label: 'Castrol', kind: 'oil_topup' as const }]
    const events = [
      event({ type: 'oil_topup', timestamp: T0, odometer: 100_000, liters: 1 }),
      event({ type: 'my_oil', timestamp: T0 + DAY, odometer: 102_000, liters: 1 }),
    ]
    expect(oilConsumption([], events, custom).overall).toBeCloseTo(0.5)
    expect(oilConsumption([], events, types).overall).toBeNull()
  })
})
