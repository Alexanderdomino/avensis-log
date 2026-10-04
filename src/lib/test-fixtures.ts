/** Builders for unit tests. Not imported by app code. */
import { DEFAULT_SETTINGS } from './defaults'
import type { CarEvent, Settings, Trip, Weather } from './types'

export const T0 = Date.UTC(2026, 0, 1, 8, 0, 0)
export const HOUR = 3_600_000
export const DAY = 24 * HOUR

export function weather(overrides: Partial<Weather> = {}): Weather {
  const w: Weather = {
    temperature: 10,
    humidity: 60,
    dewPoint: 2,
    dewPointSpread: 8,
    precipitation: 0,
    weatherCode: 1,
    pressure: 1013,
    precip12h: 0,
    minTemp12h: 9,
    source: 'forecast',
    ...overrides,
  }
  return w
}

let seq = 0
export function trip(overrides: Partial<Trip> = {}): Trip {
  seq++
  return {
    id: `t${seq}`,
    timestamp: T0 + seq * HOUR,
    rating: 'good',
    severity: null,
    situations: [],
    engine: 'warm',
    tripType: 'city',
    odometer: null,
    notes: '',
    location: { lat: 55.68, lon: 12.57, source: 'gps' },
    weatherStatus: 'ok',
    weather: weather(),
    ...overrides,
  }
}

export function event(overrides: Partial<CarEvent> = {}): CarEvent {
  seq++
  return {
    id: `e${seq}`,
    timestamp: T0 + seq * HOUR,
    type: 'other',
    odometer: null,
    liters: null,
    fuelBrand: '',
    octane: null,
    notes: '',
    ...overrides,
  }
}

/** n trips spaced one hour apart starting at `start`, `problems` of them (the first ones) rated "Hakker". */
export function tripSeries(n: number, problems: number, start: number, extra: Partial<Trip> = {}): Trip[] {
  return Array.from({ length: n }, (_, i) =>
    trip({ timestamp: start + i * HOUR, rating: i < problems ? 'hesitates' : 'good', ...extra }),
  )
}

export const settings = (overrides: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...overrides })
