import { describe, expect, it } from 'vitest'
import { fromLocalInput, parseDecimal, toLocalInput } from './format'

describe('format helpers', () => {
  it('round-trips datetime-local values', () => {
    const ms = new Date(2026, 9, 4, 7, 5).getTime()
    expect(toLocalInput(ms)).toBe('2026-10-04T07:05')
    expect(fromLocalInput('2026-10-04T07:05')).toBe(ms)
  })

  it('parses Danish and English decimals', () => {
    expect(parseDecimal('12,5')).toBe(12.5)
    expect(parseDecimal('12.5')).toBe(12.5)
    expect(parseDecimal(' 214 500 ')).toBe(214500)
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
  })
})
