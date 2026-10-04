/**
 * Firestore security rules tests. Requires the Firestore emulator:
 *   npm run test:rules
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, Timestamp, updateDoc } from 'firebase/firestore'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
  env = await initializeTestEnvironment({
    projectId: 'demo-avensis-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  })
})

afterAll(async () => {
  await env?.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
})

const alice = () => env.authenticatedContext('alice').firestore()
const bob = () => env.authenticatedContext('bob').firestore()
const anon = () => env.unauthenticatedContext().firestore()

const validTrip = (overrides: Record<string, unknown> = {}) => ({
  timestamp: Timestamp.fromMillis(Date.UTC(2026, 9, 1, 7)),
  rating: 'hesitates',
  severity: 2,
  situations: ['acceleration', 'cold_start'],
  engine: 'cold',
  tripType: 'city',
  odometer: 214_500,
  notes: 'Hakkede ved rundkørslen',
  location: { lat: 55.68, lon: 12.57, source: 'gps' },
  weatherStatus: 'ok',
  weather: {
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
  },
  ...overrides,
})

const validEvent = (overrides: Record<string, unknown> = {}) => ({
  timestamp: Timestamp.fromMillis(Date.UTC(2026, 9, 1, 7)),
  type: 'fuel_e10',
  odometer: 214_400,
  liters: 45.5,
  fuelBrand: 'Q8',
  octane: 95,
  notes: '',
  ...overrides,
})

const validSettings = (overrides: Record<string, unknown> = {}) => ({
  eventTypes: [{ id: 'fuel_e5', label: 'Benzin E5', kind: 'fuel' }],
  homeLocation: { lat: 55.68, lon: 12.57 },
  warmEngineHours: 2,
  beforeAfterWindow: 10,
  minSampleSize: 5,
  ...overrides,
})

async function seed(path: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data)
  })
}

describe('ownership', () => {
  it('lets a user read and write their own trips, events and settings', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/trips/t1'), validTrip()))
    await assertSucceeds(getDoc(doc(alice(), 'users/alice/trips/t1')))
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/events/e1'), validEvent()))
    await assertSucceeds(setDoc(doc(alice(), 'users/alice/settings/app'), validSettings()))
    await assertSucceeds(deleteDoc(doc(alice(), 'users/alice/trips/t1')))
  })

  it("denies reading another user's data", async () => {
    await seed('users/alice/trips/t1', validTrip())
    await seed('users/alice/settings/app', validSettings())
    await assertFails(getDoc(doc(bob(), 'users/alice/trips/t1')))
    await assertFails(getDoc(doc(bob(), 'users/alice/settings/app')))
  })

  it("denies writing or deleting another user's data", async () => {
    await seed('users/alice/trips/t1', validTrip())
    await assertFails(setDoc(doc(bob(), 'users/alice/trips/t2'), validTrip()))
    await assertFails(updateDoc(doc(bob(), 'users/alice/trips/t1'), { rating: 'good' }))
    await assertFails(deleteDoc(doc(bob(), 'users/alice/trips/t1')))
    await assertFails(setDoc(doc(bob(), 'users/alice/events/e1'), validEvent()))
  })

  it('denies unauthenticated access', async () => {
    await seed('users/alice/trips/t1', validTrip())
    await assertFails(getDoc(doc(anon(), 'users/alice/trips/t1')))
    await assertFails(setDoc(doc(anon(), 'users/alice/trips/t2'), validTrip()))
  })

  it('denies unknown collections and top-level documents', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/secrets/x'), { a: 1 }))
    await assertFails(setDoc(doc(alice(), 'trips/t1'), validTrip()))
    await assertFails(setDoc(doc(alice(), 'users/alice'), { a: 1 }))
  })
})

describe('trip validation', () => {
  const write = (data: Record<string, unknown>) => setDoc(doc(alice(), 'users/alice/trips/t1'), data)

  it('accepts all ratings, and minimal trips with pending weather', async () => {
    for (const rating of ['good', 'hesitates', 'no_power']) await assertSucceeds(write(validTrip({ rating })))
    await assertSucceeds(
      write({
        timestamp: Timestamp.now(),
        rating: 'good',
        engine: 'warm',
        tripType: 'motorway',
        weatherStatus: 'pending',
        weather: null,
        location: null,
        severity: null,
        odometer: null,
      }),
    )
  })

  it('rejects an unknown rating', async () => {
    await assertFails(write(validTrip({ rating: 'meh' })))
  })

  it('accepts severity 1–3 and rejects 0, 4 and non-integers', async () => {
    for (const severity of [1, 2, 3]) await assertSucceeds(write(validTrip({ severity })))
    for (const severity of [0, 4, 1.5, '2']) await assertFails(write(validTrip({ severity })))
  })

  it('rejects a negative odometer and accepts 0', async () => {
    await assertSucceeds(write(validTrip({ odometer: 0 })))
    await assertFails(write(validTrip({ odometer: -1 })))
    await assertFails(write(validTrip({ odometer: '1000' })))
  })

  it('rejects bad enums, situations, missing fields and extra fields', async () => {
    await assertFails(write(validTrip({ engine: 'hot' })))
    await assertFails(write(validTrip({ tripType: 'offroad' })))
    await assertFails(write(validTrip({ situations: ['acceleration', 'flying'] })))
    await assertFails(write(validTrip({ weatherStatus: 'maybe' })))
    await assertFails(write(validTrip({ timestamp: 'yesterday' })))
    await assertFails(write(validTrip({ hacked: true })))
    const { rating: _r, ...noRating } = validTrip()
    await assertFails(write(noRating))
  })

  it('validates location and weather maps', async () => {
    await assertFails(write(validTrip({ location: { lat: 95, lon: 12, source: 'gps' } })))
    await assertFails(write(validTrip({ location: { lat: 55, lon: 12, source: 'guess' } })))
    await assertFails(write(validTrip({ weather: { ...validTrip().weather, temperature: 'cold' } })))
    await assertFails(write(validTrip({ weather: { ...validTrip().weather, extra: 1 } })))
  })

  it('validates updates too', async () => {
    await seed('users/alice/trips/t1', validTrip())
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice/trips/t1'), { rating: 'good', severity: null }))
    await assertFails(updateDoc(doc(alice(), 'users/alice/trips/t1'), { severity: 7 }))
  })
})

describe('event validation', () => {
  const write = (data: Record<string, unknown>) => setDoc(doc(alice(), 'users/alice/events/e1'), data)

  it('accepts liters 0–100 and rejects outside', async () => {
    for (const liters of [0, 0.5, 100, null]) await assertSucceeds(write(validEvent({ liters })))
    for (const liters of [-0.1, 100.1, 'lots']) await assertFails(write(validEvent({ liters })))
  })

  it('requires odometer ≥ 0', async () => {
    await assertSucceeds(write(validEvent({ odometer: 0 })))
    await assertFails(write(validEvent({ odometer: -5 })))
  })

  it('requires a type and timestamp, and rejects extra fields', async () => {
    await assertFails(write(validEvent({ type: '' })))
    await assertFails(write(validEvent({ timestamp: 123 })))
    await assertFails(write(validEvent({ admin: true })))
    await assertSucceeds(write({ timestamp: Timestamp.now(), type: 'other' }))
  })
})

describe('settings validation', () => {
  const write = (data: Record<string, unknown>) => setDoc(doc(alice(), 'users/alice/settings/app'), data)

  it('accepts valid settings', async () => {
    await assertSucceeds(write(validSettings()))
    await assertSucceeds(write(validSettings({ homeLocation: null, warmEngineHours: 1.5 })))
  })

  it('rejects out-of-range numbers and malformed values', async () => {
    await assertFails(write(validSettings({ minSampleSize: 0 })))
    await assertFails(write(validSettings({ minSampleSize: 2.5 })))
    await assertFails(write(validSettings({ beforeAfterWindow: 1000 })))
    await assertFails(write(validSettings({ warmEngineHours: -1 })))
    await assertFails(write(validSettings({ homeLocation: { lat: 'x', lon: 1 } })))
    await assertFails(write(validSettings({ eventTypes: 'fuel' })))
    await assertFails(write(validSettings({ role: 'admin' })))
  })
})
