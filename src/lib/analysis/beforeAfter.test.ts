import { describe, expect, it } from 'vitest'
import { event, HOUR, T0, tripSeries } from '../test-fixtures'
import { beforeAfter } from './beforeAfter'

describe('beforeAfter', () => {
  const trips = [...tripSeries(20, 15, T0), ...tripSeries(20, 2, T0 + 20 * HOUR)]
  const cleaner = event({ type: 'injector_cleaner', timestamp: T0 + 19.5 * HOUR })

  it('compares the N trips before vs the N trips after', () => {
    const [row] = beforeAfter(trips, [cleaner], 10, 5)
    // trips 10..19 before: of the first series, trips 0..14 are problems → 5/10
    expect([row.before.problems, row.before.total]).toEqual([5, 10])
    expect([row.after.problems, row.after.total]).toEqual([2, 10])
    expect(row.diff).toBeCloseTo(-0.3)
  })

  it('a different window size changes the outcome', () => {
    const [row] = beforeAfter(trips, [cleaner], 20, 5)
    expect([row.before.problems, row.before.total]).toEqual([15, 20])
    expect([row.after.problems, row.after.total]).toEqual([2, 20])
    expect(row.inconclusive).toBe(false)
    expect(row.reason).toBeNull()
  })

  it('flags overlapping intervals as inconclusive', () => {
    const [row] = beforeAfter(trips, [cleaner], 10, 5)
    expect(row.inconclusive).toBe(true)
    expect(row.reason).toBe('overlap')
  })

  it('at the start of the data there are no trips before', () => {
    const [row] = beforeAfter(trips, [event({ timestamp: T0 - HOUR })], 10, 5)
    expect(row.before.total).toBe(0)
    expect(row.before.rate).toBeNull()
    expect(row.after.total).toBe(10)
    expect(row.diff).toBeNull()
    expect(row.reason).toBe('few_trips')
  })

  it('at the end of the data there are no trips after', () => {
    const [row] = beforeAfter(trips, [event({ timestamp: T0 + 100 * HOUR })], 10, 5)
    expect(row.before.total).toBe(10)
    expect(row.after.total).toBe(0)
    expect(row.inconclusive).toBe(true)
  })

  it('uses shorter windows when fewer than N trips exist', () => {
    const few = tripSeries(6, 3, T0)
    const [row] = beforeAfter(few, [event({ timestamp: T0 + 1.5 * HOUR })], 10, 5)
    expect(row.before.total).toBe(2)
    expect(row.after.total).toBe(4)
    expect(row.reason).toBe('few_trips')
  })

  it('counts a trip at exactly the event time as after', () => {
    const [row] = beforeAfter(tripSeries(3, 0, T0), [event({ timestamp: T0 + HOUR })], 10, 1)
    expect(row.before.total).toBe(1)
    expect(row.after.total).toBe(2)
  })

  it('the minimum sample setting decides "few trips"', () => {
    const few = tripSeries(6, 3, T0)
    const ev = event({ timestamp: T0 + 2.5 * HOUR })
    expect(beforeAfter(few, [ev], 10, 5)[0].reason).toBe('few_trips')
    expect(beforeAfter(few, [ev], 10, 3)[0].reason).toBe('overlap')
  })

  it('returns one row per event, oldest first', () => {
    const rows = beforeAfter(trips, [event({ id: 'b', timestamp: T0 + 30 * HOUR }), event({ id: 'a', timestamp: T0 })], 10, 5)
    expect(rows.map((r) => r.event.id)).toEqual(['a', 'b'])
  })
})
