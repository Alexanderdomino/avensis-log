/**
 * Open-Meteo weather fetching and mapping.
 *
 * Open-Meteo is free, needs no API key and sends CORS headers, so the SPA calls it directly.
 * Data © Open-Meteo.com, licensed CC BY 4.0 (attribution is shown in the UI).
 *
 * Three request modes, picked from the trip timestamp:
 *  - "current":  trip logged now → forecast API `current=` block + `past_days=1` hourly for the 12 h window.
 *  - "recent":   trip within the last RECENT_DAYS → forecast API with `past_days`, hourly only.
 *  - "archive":  older trips → historical archive API, hourly only.
 * All requests use `timeformat=unixtime` so no time-zone parsing is needed.
 */
import type { GeoPoint, Trip, Weather } from './types'

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
export const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'

const VARIABLES = [
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'precipitation',
  'weather_code',
  'surface_pressure',
] as const

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** A trip timestamp this close to "now" is treated as a live reading. */
export const CURRENT_THRESHOLD_MS = HOUR
/** Trips newer than this use the forecast API's past_days; older use the archive API. */
export const RECENT_DAYS = 7
export const WINDOW_HOURS = 12
const FETCH_TIMEOUT_MS = 10_000

export type WeatherMode = 'current' | 'recent' | 'archive'

export class WeatherError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WeatherError'
  }
}

export function roundCoord(value: number): number {
  return Math.round(value * 100) / 100
}

export function roundPoint(p: GeoPoint): GeoPoint {
  return { lat: roundCoord(p.lat), lon: roundCoord(p.lon) }
}

const round1 = (v: number) => Math.round(v * 10) / 10

export function dewPointSpread(temperature: number, dewPoint: number): number {
  return round1(temperature - dewPoint)
}

export function chooseMode(timestamp: number, now: number): WeatherMode {
  const age = now - timestamp
  if (age <= CURRENT_THRESHOLD_MS) return 'current'
  if (age <= RECENT_DAYS * DAY) return 'recent'
  return 'archive'
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function buildWeatherUrl(point: GeoPoint, timestamp: number, now: number): { url: string; mode: WeatherMode } {
  const mode = chooseMode(timestamp, now)
  const p = roundPoint(point)
  const params = new URLSearchParams({
    latitude: String(p.lat),
    longitude: String(p.lon),
    hourly: VARIABLES.join(','),
    timezone: 'GMT',
    timeformat: 'unixtime',
  })
  if (mode === 'archive') {
    // Include the previous day so the 12 h window is covered for trips just after midnight UTC.
    params.set('start_date', isoDate(timestamp - DAY))
    params.set('end_date', isoDate(timestamp))
    return { url: `${ARCHIVE_URL}?${params}`, mode }
  }
  if (mode === 'current') {
    params.set('current', VARIABLES.join(','))
    params.set('past_days', '1')
  } else {
    // +1 so the 12 h window before the trip is always inside the returned range.
    params.set('past_days', String(Math.min(92, Math.ceil((now - timestamp) / DAY) + 1)))
  }
  params.set('forecast_days', '1')
  return { url: `${FORECAST_URL}?${params}`, mode }
}

type Series = Partial<Record<(typeof VARIABLES)[number], (number | null)[]>> & { time?: number[] }
type CurrentBlock = Partial<Record<(typeof VARIABLES)[number], number | null>> & { time?: number }
export interface OpenMeteoResponse {
  current?: CurrentBlock
  hourly?: Series
  error?: boolean
  reason?: string
}

interface HourPoint {
  time: number // epoch ms
  temperature: number | null
  precipitation: number | null
}

function hourlyPoints(h: Series): HourPoint[] {
  const times = h.time ?? []
  return times.map((t, i) => ({
    time: t * 1000,
    temperature: h.temperature_2m?.[i] ?? null,
    precipitation: h.precipitation?.[i] ?? null,
  }))
}

/**
 * Precipitation sum and minimum temperature over the WINDOW_HOURS before `timestamp`
 * (hours with time in (ts − 12 h, ts]). Missing hourly values are skipped.
 * `extraTemp` lets the live reading count towards the minimum.
 */
export function derive12h(
  hourly: Series,
  timestamp: number,
  extraTemp?: number | null,
): { precip12h: number; minTemp12h: number } {
  const from = timestamp - WINDOW_HOURS * HOUR
  const inWindow = hourlyPoints(hourly).filter((p) => p.time > from && p.time <= timestamp)
  const temps = inWindow.map((p) => p.temperature).filter((v): v is number => v != null)
  if (extraTemp != null) temps.push(extraTemp)
  const precips = inWindow.map((p) => p.precipitation).filter((v): v is number => v != null)
  if (temps.length === 0) throw new WeatherError('Ingen timedata i de seneste 12 timer')
  return {
    precip12h: round1(precips.reduce((a, b) => a + b, 0)),
    minTemp12h: round1(Math.min(...temps)),
  }
}

function requireNumber(v: number | null | undefined, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new WeatherError(`Mangler ${name}`)
  return v
}

/** Map a forecast response with a `current` block (live trip). */
export function mapCurrent(json: OpenMeteoResponse, timestamp: number): Weather {
  const c = json.current
  if (!c) throw new WeatherError('Svar mangler aktuelle data')
  const temperature = requireNumber(c.temperature_2m, 'temperatur')
  const dewPoint = requireNumber(c.dew_point_2m, 'dugpunkt')
  const { precip12h, minTemp12h } = derive12h(json.hourly ?? {}, timestamp, temperature)
  return {
    temperature: round1(temperature),
    humidity: Math.round(requireNumber(c.relative_humidity_2m, 'luftfugtighed')),
    dewPoint: round1(dewPoint),
    dewPointSpread: dewPointSpread(temperature, dewPoint),
    precipitation: round1(requireNumber(c.precipitation, 'nedbør')),
    weatherCode: requireNumber(c.weather_code, 'vejrkode'),
    pressure: Math.round(requireNumber(c.surface_pressure, 'lufttryk')),
    precip12h,
    minTemp12h,
    source: 'forecast',
  }
}

/** Map an hourly-only response (recent or archive) using the hour closest to the trip. */
export function mapHourly(json: OpenMeteoResponse, timestamp: number, source: Weather['source']): Weather {
  const h = json.hourly
  const times = h?.time ?? []
  if (!h || times.length === 0) throw new WeatherError('Svar mangler timedata')
  let best = 0
  for (let i = 1; i < times.length; i++) {
    if (Math.abs(times[i] * 1000 - timestamp) < Math.abs(times[best] * 1000 - timestamp)) best = i
  }
  if (Math.abs(times[best] * 1000 - timestamp) > HOUR) throw new WeatherError('Ingen data for tidspunktet')
  const temperature = requireNumber(h.temperature_2m?.[best], 'temperatur')
  const dewPoint = requireNumber(h.dew_point_2m?.[best], 'dugpunkt')
  const { precip12h, minTemp12h } = derive12h(h, timestamp, temperature)
  return {
    temperature: round1(temperature),
    humidity: Math.round(requireNumber(h.relative_humidity_2m?.[best], 'luftfugtighed')),
    dewPoint: round1(dewPoint),
    dewPointSpread: dewPointSpread(temperature, dewPoint),
    precipitation: round1(requireNumber(h.precipitation?.[best], 'nedbør')),
    weatherCode: requireNumber(h.weather_code?.[best], 'vejrkode'),
    pressure: Math.round(requireNumber(h.surface_pressure?.[best], 'lufttryk')),
    precip12h,
    minTemp12h,
    source,
  }
}

export interface WeatherDeps {
  fetch?: typeof fetch
  now?: () => number
}

/** Fetch and map weather for a point and time. Throws WeatherError on any failure. */
export async function fetchWeather(point: GeoPoint, timestamp: number, deps: WeatherDeps = {}): Promise<Weather> {
  const doFetch = deps.fetch ?? globalThis.fetch.bind(globalThis)
  const now = (deps.now ?? Date.now)()
  const { url, mode } = buildWeatherUrl(point, timestamp, now)
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : undefined
  let json: OpenMeteoResponse
  try {
    const res = await doFetch(url, { signal: controller?.signal })
    if (!res.ok) throw new WeatherError(`Open-Meteo svarede ${res.status}`)
    json = (await res.json()) as OpenMeteoResponse
  } catch (e) {
    if (e instanceof WeatherError) throw e
    throw new WeatherError(`Kunne ikke hente vejr: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    if (timer) clearTimeout(timer)
  }
  if (json.error) throw new WeatherError(json.reason ?? 'Open-Meteo fejl')
  return mode === 'current' ? mapCurrent(json, timestamp) : mapHourly(json, timestamp, mode === 'archive' ? 'archive' : 'forecast')
}

// ---------- Pending / backfill ----------

export function needsWeather(trip: Pick<Trip, 'weatherStatus'>): boolean {
  return trip.weatherStatus === 'pending'
}

export interface BackfillDeps {
  fetchWeather: (point: GeoPoint, timestamp: number) => Promise<Weather>
  /** Used when the trip itself has no stored location. */
  homeLocation: GeoPoint | null
  save: (tripId: string, patch: Pick<Trip, 'weather' | 'weatherStatus' | 'location'>) => Promise<void>
  /** Safety cap per run so a long offline period doesn't hammer the API. */
  limit?: number
}

export interface BackfillResult {
  updated: number
  failed: number
  /** Pending trips with no location and no home location to fall back to. */
  skipped: number
}

/**
 * Fetch weather for every trip with weatherStatus "pending", using each trip's own
 * timestamp and stored location (or the home location if none). Trips that fail stay pending.
 */
export async function backfillPendingWeather(trips: Trip[], deps: BackfillDeps): Promise<BackfillResult> {
  const result: BackfillResult = { updated: 0, failed: 0, skipped: 0 }
  const pending = trips.filter(needsWeather).sort((a, b) => b.timestamp - a.timestamp)
  for (const trip of pending.slice(0, deps.limit ?? 50)) {
    const location = trip.location ?? (deps.homeLocation ? { ...roundPoint(deps.homeLocation), source: 'home' as const } : null)
    if (!location) {
      result.skipped++
      continue
    }
    try {
      const weather = await deps.fetchWeather(location, trip.timestamp)
      await deps.save(trip.id, { weather, weatherStatus: 'ok', location })
      result.updated++
    } catch {
      result.failed++
    }
  }
  return result
}
