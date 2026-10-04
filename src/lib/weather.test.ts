import { describe, expect, it, vi } from 'vitest'
import { trip, weather } from './test-fixtures'
import {
  ARCHIVE_URL,
  backfillPendingWeather,
  buildWeatherUrl,
  chooseMode,
  derive12h,
  dewPointSpread,
  fetchWeather,
  FORECAST_URL,
  mapCurrent,
  mapHourly,
  needsWeather,
  roundCoord,
  WeatherError,
  type OpenMeteoResponse,
} from './weather'

const HOUR = 3_600_000
const NOW = Date.UTC(2026, 9, 4, 7, 30) // 2026-10-04 07:30 UTC
const point = { lat: 55.676111, lon: 12.568333 }

/** Hourly series of `hours` hours ending at the full hour <= `end`, with values from fns. */
function hourly(end: number, hours: number, temp: (i: number) => number, precip: (i: number) => number = () => 0) {
  const last = Math.floor(end / HOUR) * HOUR
  const time: number[] = []
  for (let i = hours - 1; i >= 0; i--) time.push((last - i * HOUR) / 1000)
  return {
    time,
    temperature_2m: time.map((_, i) => temp(i)),
    relative_humidity_2m: time.map(() => 88),
    dew_point_2m: time.map((_, i) => temp(i) - 1.5),
    precipitation: time.map((_, i) => precip(i)),
    weather_code: time.map(() => 3),
    surface_pressure: time.map(() => 1009.6),
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const currentBody = (): OpenMeteoResponse => ({
  current: {
    time: NOW / 1000,
    temperature_2m: 6.4,
    relative_humidity_2m: 93,
    dew_point_2m: 5.4,
    precipitation: 0.3,
    weather_code: 61,
    surface_pressure: 1004.2,
  },
  // 36 hours: index 35 is 07:00 today. Coldest (−1.2) 6 hours ago; rain 2 mm/h for 3 hours inside the window
  // and 10 mm/h 20 hours ago (outside the window).
  hourly: hourly(NOW, 36, (i) => (i === 29 ? -1.2 : i === 10 ? -8 : 5), (i) => (i >= 30 && i <= 32 ? 2 : i === 15 ? 10 : 0)),
})

describe('small helpers', () => {
  it('rounds coordinates to 2 decimals', () => {
    expect(roundCoord(55.676111)).toBe(55.68)
    expect(roundCoord(12.564999)).toBe(12.56)
    expect(roundCoord(-0.005001)).toBe(-0.01)
  })

  it('dew point spread = temperature − dew point, 1 decimal', () => {
    expect(dewPointSpread(6.4, 5.4)).toBe(1)
    expect(dewPointSpread(10, 10)).toBe(0)
    expect(dewPointSpread(-2.33, -4.01)).toBe(1.7)
  })

  it('needsWeather is true only for pending trips', () => {
    expect(needsWeather({ weatherStatus: 'pending' })).toBe(true)
    expect(needsWeather({ weatherStatus: 'ok' })).toBe(false)
  })
})

describe('request building', () => {
  it('picks current / recent / archive by age', () => {
    expect(chooseMode(NOW, NOW)).toBe('current')
    expect(chooseMode(NOW - HOUR, NOW)).toBe('current')
    expect(chooseMode(NOW - HOUR - 1, NOW)).toBe('recent')
    expect(chooseMode(NOW - 7 * 24 * HOUR, NOW)).toBe('recent')
    expect(chooseMode(NOW - 7 * 24 * HOUR - 1, NOW)).toBe('archive')
    expect(chooseMode(NOW + HOUR, NOW)).toBe('current')
  })

  it('builds a current request with past_days=1 and rounded coordinates', () => {
    const { url, mode } = buildWeatherUrl(point, NOW, NOW)
    const u = new URL(url)
    expect(mode).toBe('current')
    expect(url.startsWith(FORECAST_URL)).toBe(true)
    expect(u.searchParams.get('latitude')).toBe('55.68')
    expect(u.searchParams.get('longitude')).toBe('12.57')
    expect(u.searchParams.get('past_days')).toBe('1')
    expect(u.searchParams.get('timeformat')).toBe('unixtime')
    expect(u.searchParams.get('current')).toBe(
      'temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,weather_code,surface_pressure',
    )
    expect(u.searchParams.get('hourly')).toContain('dew_point_2m')
  })

  it('builds a recent request covering the trip plus the 12 h before it', () => {
    const { url, mode } = buildWeatherUrl(point, NOW - 3.2 * 24 * HOUR, NOW)
    expect(mode).toBe('recent')
    const u = new URL(url)
    expect(u.searchParams.get('past_days')).toBe('5')
    expect(u.searchParams.get('current')).toBeNull()
  })

  it('builds an archive request with the trip day and the day before', () => {
    const ts = Date.UTC(2026, 5, 15, 0, 30)
    const { url, mode } = buildWeatherUrl(point, ts, NOW)
    expect(mode).toBe('archive')
    expect(url.startsWith(ARCHIVE_URL)).toBe(true)
    const u = new URL(url)
    expect(u.searchParams.get('start_date')).toBe('2026-06-14')
    expect(u.searchParams.get('end_date')).toBe('2026-06-15')
  })
})

describe('derive12h', () => {
  it('sums precipitation and finds the minimum temperature in (ts − 12 h, ts]', () => {
    const h = hourly(NOW, 36, (i) => (i === 29 ? -1.2 : i === 10 ? -8 : 5), (i) => (i >= 30 && i <= 32 ? 2 : i === 15 ? 10 : 0))
    expect(derive12h(h, NOW)).toEqual({ precip12h: 6, minTemp12h: -1.2 })
  })

  it('excludes the hour exactly 12 h before and includes the hour at ts', () => {
    const ts = Date.UTC(2026, 9, 4, 12, 0)
    const h = hourly(ts, 13, (i) => (i === 0 ? -5 : i === 12 ? -3 : 4), (i) => (i === 0 ? 9 : i === 12 ? 1 : 0))
    // index 0 is exactly ts − 12 h (excluded), index 12 is ts (included)
    expect(derive12h(h, ts)).toEqual({ precip12h: 1, minTemp12h: -3 })
  })

  it('lets the live reading count towards the minimum and skips null values', () => {
    const h = hourly(NOW, 12, () => 5)
    h.temperature_2m[3] = null as unknown as number
    expect(derive12h(h, NOW, 2.2).minTemp12h).toBe(2.2)
  })

  it('throws when there is no hourly data in the window', () => {
    expect(() => derive12h({ time: [] }, NOW)).toThrow(WeatherError)
  })
})

describe('mapping', () => {
  it('maps a current response', () => {
    expect(mapCurrent(currentBody(), NOW)).toEqual({
      temperature: 6.4,
      humidity: 93,
      dewPoint: 5.4,
      dewPointSpread: 1,
      precipitation: 0.3,
      weatherCode: 61,
      pressure: 1004,
      precip12h: 6,
      minTemp12h: -1.2,
      source: 'forecast',
    })
  })

  it('maps an hourly response using the hour closest to the trip', () => {
    const ts = Date.UTC(2026, 5, 15, 14, 20)
    const h = hourly(ts + HOUR, 30, (i) => i) // last entry 15:00 has i=29, 14:00 has i=28
    const w = mapHourly({ hourly: h }, ts, 'archive')
    expect(w.temperature).toBe(28)
    expect(w.dewPointSpread).toBe(1.5)
    expect(w.minTemp12h).toBe(17) // hours 03:00..14:00 → i = 17..28
    expect(w.source).toBe('archive')
  })

  it('throws on missing values (e.g. archive not yet available)', () => {
    const ts = Date.UTC(2026, 5, 15, 14, 0)
    const h = hourly(ts, 24, () => 5)
    h.temperature_2m[23] = null as unknown as number
    expect(() => mapHourly({ hourly: h }, ts, 'archive')).toThrow(/temperatur/)
    expect(() => mapHourly({ hourly: hourly(ts - 5 * HOUR, 24, () => 5) }, ts, 'archive')).toThrow(/tidspunktet/)
    expect(() => mapCurrent({ hourly: h }, ts)).toThrow(WeatherError)
  })
})

describe('fetchWeather (mocked fetch)', () => {
  it('fetches and maps current weather', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(currentBody()))
    const w = await fetchWeather(point, NOW, { fetch: fetchMock, now: () => NOW })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain('current=')
    expect(w.dewPointSpread).toBe(1)
    expect(w.precip12h).toBe(6)
  })

  it('uses the archive API for old trips', async () => {
    const ts = Date.UTC(2026, 0, 10, 9, 0)
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ hourly: hourly(ts, 33, () => 1) }))
    const w = await fetchWeather(point, ts, { fetch: fetchMock, now: () => NOW })
    expect(fetchMock.mock.calls[0][0]).toContain(ARCHIVE_URL)
    expect(w.source).toBe('archive')
  })

  it('rejects with WeatherError on HTTP errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: true, reason: 'boom' }, 500))
    await expect(fetchWeather(point, NOW, { fetch: fetchMock, now: () => NOW })).rejects.toThrow('Open-Meteo svarede 500')
  })

  it('rejects with WeatherError on network failure (offline)', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(fetchWeather(point, NOW, { fetch: fetchMock, now: () => NOW })).rejects.toBeInstanceOf(WeatherError)
  })

  it('rejects on an API error payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: true, reason: 'Latitude must be in range' }))
    await expect(fetchWeather(point, NOW, { fetch: fetchMock, now: () => NOW })).rejects.toThrow('Latitude must be in range')
  })

  it('rejects on malformed JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<html>', { status: 200 }))
    await expect(fetchWeather(point, NOW, { fetch: fetchMock, now: () => NOW })).rejects.toBeInstanceOf(WeatherError)
  })
})

describe('backfillPendingWeather', () => {
  it('fetches weather for pending trips only, using their own timestamp and location', async () => {
    const pending = trip({ id: 'p', weatherStatus: 'pending', weather: null, timestamp: NOW - 3 * HOUR, location: { lat: 56.1, lon: 10.2, source: 'gps' } })
    const ok = trip({ id: 'ok' })
    const fetcher = vi.fn().mockResolvedValue(weather({ temperature: 3 }))
    const save = vi.fn().mockResolvedValue(undefined)
    const r = await backfillPendingWeather([pending, ok], { fetchWeather: fetcher, homeLocation: null, save })
    expect(r).toEqual({ updated: 1, failed: 0, skipped: 0 })
    expect(fetcher).toHaveBeenCalledWith({ lat: 56.1, lon: 10.2, source: 'gps' }, NOW - 3 * HOUR)
    expect(save).toHaveBeenCalledWith('p', { weather: weather({ temperature: 3 }), weatherStatus: 'ok', location: pending.location })
  })

  it('falls back to the home location for pending trips without a location', async () => {
    const pending = trip({ id: 'p', weatherStatus: 'pending', weather: null, location: null })
    const fetcher = vi.fn().mockResolvedValue(weather())
    const save = vi.fn().mockResolvedValue(undefined)
    await backfillPendingWeather([pending], { fetchWeather: fetcher, homeLocation: { lat: 55.123, lon: 9.876 }, save })
    expect(fetcher.mock.calls[0][0]).toEqual({ lat: 55.12, lon: 9.88, source: 'home' })
    expect(save.mock.calls[0][1].location).toEqual({ lat: 55.12, lon: 9.88, source: 'home' })
  })

  it('skips trips with no location and no home location', async () => {
    const fetcher = vi.fn()
    const r = await backfillPendingWeather([trip({ weatherStatus: 'pending', weather: null, location: null })], { fetchWeather: fetcher, homeLocation: null, save: vi.fn() })
    expect(r).toEqual({ updated: 0, failed: 0, skipped: 1 })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('leaves trips pending when the API fails and continues with the rest', async () => {
    const a = trip({ id: 'a', weatherStatus: 'pending', weather: null, timestamp: NOW })
    const b = trip({ id: 'b', weatherStatus: 'pending', weather: null, timestamp: NOW - HOUR })
    const fetcher = vi.fn().mockRejectedValueOnce(new WeatherError('down')).mockResolvedValueOnce(weather())
    const save = vi.fn().mockResolvedValue(undefined)
    const r = await backfillPendingWeather([a, b], { fetchWeather: fetcher, homeLocation: null, save })
    expect(r).toEqual({ updated: 1, failed: 1, skipped: 0 })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0]).toBe('b')
  })

  it('works end to end with fetchWeather and a mocked fetch, choosing the API by trip age', async () => {
    const old = trip({ id: 'old', weatherStatus: 'pending', weather: null, timestamp: Date.UTC(2026, 3, 1, 12) })
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const ts = url.startsWith(ARCHIVE_URL) ? Date.UTC(2026, 3, 1, 12) : NOW
      return jsonResponse({ hourly: hourly(ts, 30, () => 4) })
    })
    const save = vi.fn().mockResolvedValue(undefined)
    await backfillPendingWeather([old], {
      fetchWeather: (p, ts) => fetchWeather(p, ts, { fetch: fetchMock, now: () => NOW }),
      homeLocation: null,
      save,
    })
    expect(fetchMock.mock.calls[0][0]).toContain(ARCHIVE_URL)
    expect(save.mock.calls[0][1]).toMatchObject({ weatherStatus: 'ok', weather: { temperature: 4, source: 'archive' } })
  })

  it('respects the per-run limit, newest first', async () => {
    const trips = [1, 2, 3].map((i) => trip({ id: `p${i}`, weatherStatus: 'pending', weather: null, timestamp: NOW - i * HOUR }))
    const save = vi.fn().mockResolvedValue(undefined)
    await backfillPendingWeather(trips, { fetchWeather: vi.fn().mockResolvedValue(weather()), homeLocation: null, save, limit: 2 })
    expect(save.mock.calls.map((c) => c[0])).toEqual(['p1', 'p2'])
  })
})
