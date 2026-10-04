import { describe, expect, it } from 'vitest'
import { formatPct, formatRate, intervalsOverlap, problemRate, rateStat, wilson } from './stats'
import { trip } from '../test-fixtures'

describe('wilson', () => {
  it('matches the textbook value for 7/12', () => {
    const ci = wilson(7, 12)!
    expect(ci.low).toBeCloseTo(0.3195, 4)
    expect(ci.high).toBeCloseTo(0.8067, 4)
  })

  it('handles 0/n with a lower bound of exactly 0 and a non-zero upper bound', () => {
    const ci = wilson(0, 10)!
    expect(ci.low).toBe(0)
    expect(ci.high).toBeCloseTo(0.2775, 4)
  })

  it('handles n/n with an upper bound of exactly 1 and a lower bound below 1', () => {
    const ci = wilson(10, 10)!
    expect(ci.high).toBe(1)
    expect(ci.low).toBeCloseTo(0.7225, 4)
  })

  it('gives a very wide interval for 1/1', () => {
    const ci = wilson(1, 1)!
    expect(ci.high).toBe(1)
    expect(ci.low).toBeCloseTo(0.2065, 4)
  })

  it('returns null for n = 0', () => {
    expect(wilson(0, 0)).toBeNull()
  })

  it('always contains the point estimate', () => {
    for (let n = 1; n <= 30; n++) {
      for (let k = 0; k <= n; k++) {
        const ci = wilson(k, n)!
        expect(ci.low).toBeLessThanOrEqual(k / n)
        expect(ci.high).toBeGreaterThanOrEqual(k / n)
        expect(ci.low).toBeGreaterThanOrEqual(0)
        expect(ci.high).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('problemRate', () => {
  it('counts Hakker and Ingen power as problems', () => {
    const trips = [trip({ rating: 'good' }), trip({ rating: 'hesitates' }), trip({ rating: 'no_power' }), trip()]
    const s = problemRate(trips, 1)
    expect(s.problems).toBe(2)
    expect(s.total).toBe(4)
    expect(s.rate).toBe(0.5)
  })

  it('computes 0/n and n/n', () => {
    expect(problemRate([trip(), trip()], 1)).toMatchObject({ problems: 0, total: 2, rate: 0, low: 0 })
    expect(problemRate([trip({ rating: 'no_power' })], 1)).toMatchObject({ problems: 1, total: 1, rate: 1, high: 1 })
  })

  it('has no rate for an empty set', () => {
    expect(problemRate([], 5)).toEqual({ problems: 0, total: 0, rate: null, low: null, high: null, sufficient: false })
  })

  it('marks the result insufficient below the minimum sample size', () => {
    expect(rateStat(1, 4, 5).sufficient).toBe(false)
    expect(rateStat(1, 5, 5).sufficient).toBe(true)
  })
})

describe('intervalsOverlap', () => {
  it('detects overlap and separation', () => {
    expect(intervalsOverlap(rateStat(7, 12, 1), rateStat(3, 21, 1))).toBe(true)
    expect(intervalsOverlap(rateStat(20, 20, 1), rateStat(0, 20, 1))).toBe(false)
  })

  it('treats empty sides as overlapping (inconclusive)', () => {
    expect(intervalsOverlap(rateStat(0, 0, 1), rateStat(5, 5, 1))).toBe(true)
  })
})

describe('formatting', () => {
  it('uses Danish percent style', () => {
    expect(formatPct(0.5833)).toBe('58 %')
    expect(formatPct(null)).toBe('–')
    expect(formatRate(rateStat(7, 12, 1))).toBe('58 % (7/12)')
  })
})
