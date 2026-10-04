import { describe, expect, it } from 'vitest'
import { getBrowserPosition, resolveTripLocation } from './location'

describe('resolveTripLocation', () => {
  it('rounds GPS coordinates to 2 decimals', async () => {
    expect(await resolveTripLocation(null, async () => ({ lat: 55.67891, lon: 12.56123 }))).toEqual({ lat: 55.68, lon: 12.56, source: 'gps' })
  })

  it('falls back to the home location when GPS is unavailable', async () => {
    expect(await resolveTripLocation({ lat: 56.157, lon: 10.211 }, async () => null)).toEqual({ lat: 56.16, lon: 10.21, source: 'home' })
  })

  it('returns null without GPS or home location', async () => {
    expect(await resolveTripLocation(null, async () => null)).toBeNull()
  })
})

describe('getBrowserPosition', () => {
  const geo = (impl: Geolocation['getCurrentPosition']) => ({ getCurrentPosition: impl }) as unknown as Geolocation

  it('resolves the position on success', async () => {
    const g = geo((ok) => ok({ coords: { latitude: 1, longitude: 2 } } as GeolocationPosition))
    expect(await getBrowserPosition(g)).toEqual({ lat: 1, lon: 2 })
  })

  it('resolves null when permission is denied', async () => {
    const g = geo((_ok, err) => err?.({ code: 1, message: 'denied' } as GeolocationPositionError))
    expect(await getBrowserPosition(g)).toBeNull()
  })

  it('resolves null if the browser never answers', async () => {
    const g = geo(() => {})
    expect(await getBrowserPosition(g, 10)).toBeNull()
  })

  it('resolves null when geolocation is unsupported', async () => {
    expect(await getBrowserPosition(undefined)).toBeNull()
  })
})
