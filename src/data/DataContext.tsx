import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { DEFAULT_SETTINGS } from '../lib/defaults'
import type { CarEvent, Settings, Trip } from '../lib/types'
import { backfillPendingWeather, fetchWeather, needsWeather, type BackfillResult } from '../lib/weather'
import { subscribeEvents, subscribeSettings, subscribeTrips, updateTrip } from './repo'

export interface DataError {
  code: string
  message: string
}

interface DataState {
  uid: string
  trips: Trip[]
  events: CarEvent[]
  settings: Settings
  loading: boolean
  /** Set when a Firestore listener fails (e.g. permission-denied); the data can't be trusted then. */
  error: DataError | null
  pendingWeather: number
  backfilling: boolean
  /** Fetch weather for all pending trips. */
  backfill: () => Promise<BackfillResult | null>
}

const DataContext = createContext<DataState | null>(null)

export function DataProvider({ uid, children }: { uid: string; children: ReactNode }) {
  const [trips, setTrips] = useState<Trip[]>([])
  const [events, setEvents] = useState<CarEvent[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [loaded, setLoaded] = useState({ trips: false, events: false, settings: false })
  const [error, setError] = useState<DataError | null>(null)
  const [backfilling, setBackfilling] = useState(false)

  useEffect(() => {
    const onError = (e: Error) => setError({ code: (e as { code?: string }).code ?? 'unknown', message: e.message })
    const unsubs = [
      subscribeTrips(uid, (t) => (setTrips(t), setLoaded((l) => ({ ...l, trips: true }))), onError),
      subscribeEvents(uid, (e) => (setEvents(e), setLoaded((l) => ({ ...l, events: true }))), onError),
      subscribeSettings(uid, (s) => (setSettings(s), setLoaded((l) => ({ ...l, settings: true }))), onError),
    ]
    return () => unsubs.forEach((u) => u())
  }, [uid])

  // Keep the latest data in a ref so backfill can be triggered from timers/events.
  const latest = useRef({ trips, settings })
  useEffect(() => {
    latest.current = { trips, settings }
  }, [trips, settings])
  const running = useRef(false)
  const rerun = useRef(false)

  const backfill = useCallback(async (): Promise<BackfillResult | null> => {
    if (running.current) {
      // Another run is in progress; make sure trips that became pending meanwhile get a turn.
      rerun.current = true
      return null
    }
    running.current = true
    setBackfilling(true)
    try {
      let result: BackfillResult
      do {
        rerun.current = false
        result = await backfillPendingWeather(latest.current.trips, {
          fetchWeather: (p, ts) => fetchWeather(p, ts),
          homeLocation: latest.current.settings.homeLocation,
          save: async (id, patch) => updateTrip(uid, id, patch),
        })
      } while (rerun.current)
      return result
    } finally {
      running.current = false
      setBackfilling(false)
    }
  }, [uid])

  const loading = !loaded.trips || !loaded.events || !loaded.settings
  const pendingWeather = trips.filter(needsWeather).length

  // Backfill automatically: each pending trip is tried once per app session as soon as it shows up
  // (pending trips may arrive from the server after the first cached snapshot), and everything
  // pending is retried whenever the browser comes back online.
  const attempted = useRef(new Set<string>())
  useEffect(() => {
    if (loading || !navigator.onLine) return
    const fresh = trips.filter((t) => needsWeather(t) && !attempted.current.has(t.id))
    if (fresh.length === 0) return
    fresh.forEach((t) => attempted.current.add(t.id))
    void backfill()
  }, [loading, trips, backfill])
  useEffect(() => {
    const onOnline = () => void backfill()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [backfill])

  const value: DataState = { uid, trips, events, settings, loading, error, pendingWeather, backfilling, backfill }
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData(): DataState {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData outside DataProvider')
  return ctx
}
