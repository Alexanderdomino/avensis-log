import { describe, expect, it } from 'vitest'
import { buildCsv, CSV_COLUMNS, csvEscape } from './csv'
import { event, HOUR, settings, T0, trip, weather } from './test-fixtures'

describe('csv', () => {
  it('escapes commas, quotes and newlines', () => {
    expect(csvEscape('plain')).toBe('plain')
    expect(csvEscape('a,b')).toBe('"a,b"')
    expect(csvEscape('sagde "hej"')).toBe('"sagde ""hej"""')
    expect(csvEscape('to\nlinjer')).toBe('"to\nlinjer"')
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(0)).toBe('0')
  })

  it('writes one row per trip and event, oldest first, with weather columns', () => {
    const csv = buildCsv(
      [
        trip({ id: 'trip1', timestamp: T0 + 2 * HOUR, rating: 'hesitates', severity: 2, situations: ['acceleration', 'uphill'], notes: 'hakkede, ved rundkørsel', weather: weather({ dewPointSpread: 1.5 }) }),
        trip({ id: 'trip2', timestamp: T0 + 3 * HOUR, weatherStatus: 'pending', weather: null }),
      ],
      [event({ id: 'ev1', timestamp: T0, type: 'fuel_e10', liters: 45.2, fuelBrand: 'Q8', octane: 95 })],
      settings(),
    )
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe(CSV_COLUMNS.join(','))
    expect(lines).toHaveLength(4)
    const rows = lines.slice(1).map((l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, '')))
    const col = (row: string[], name: (typeof CSV_COLUMNS)[number]) => row[CSV_COLUMNS.indexOf(name)]
    expect(col(rows[0], 'record_type')).toBe('event')
    expect(col(rows[0], 'event_label')).toBe('Benzin E10')
    expect(col(rows[0], 'liters')).toBe('45.2')
    expect(col(rows[1], 'record_type')).toBe('trip')
    expect(col(rows[1], 'situations')).toBe('acceleration|uphill')
    expect(col(rows[1], 'notes')).toBe('"hakkede, ved rundkørsel"')
    expect(col(rows[1], 'dew_point_spread_c')).toBe('1.5')
    expect(col(rows[1], 'fuel_in_tank')).toBe('Benzin E10')
    expect(col(rows[1], 'trips_since_fill')).toBe('1')
    expect(col(rows[1], 'timestamp')).toBe(new Date(T0 + 2 * HOUR).toISOString())
    expect(col(rows[2], 'weather_status')).toBe('pending')
    expect(col(rows[2], 'temperature_c')).toBe('')
  })
})
