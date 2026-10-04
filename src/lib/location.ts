import type { GeoPoint, TripLocation } from './types'
import { roundPoint } from './weather'

export const GEO_TIMEOUT_MS = 8000

/** Current position via the browser Geolocation API, or null on denial/timeout/unsupported. */
export function getBrowserPosition(
  geo: Geolocation | undefined = typeof navigator !== 'undefined' ? navigator.geolocation : undefined,
  timeoutMs = GEO_TIMEOUT_MS,
): Promise<GeoPoint | null> {
  if (!geo) return Promise.resolve(null)
  return new Promise((resolve) => {
    // Some browsers never call back when the permission prompt is ignored; guard with our own timer.
    const timer = setTimeout(() => resolve(null), timeoutMs + 500)
    geo.getCurrentPosition(
      (pos) => {
        clearTimeout(timer)
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude })
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      },
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60_000 },
    )
  })
}

/** GPS position rounded to 2 decimals, falling back to the home location from settings. */
export async function resolveTripLocation(
  homeLocation: GeoPoint | null,
  getPosition: () => Promise<GeoPoint | null> = () => getBrowserPosition(),
): Promise<TripLocation | null> {
  const pos = await getPosition()
  if (pos) return { ...roundPoint(pos), source: 'gps' }
  if (homeLocation) return { ...roundPoint(homeLocation), source: 'home' }
  return null
}
