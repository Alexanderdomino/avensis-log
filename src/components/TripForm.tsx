import { useEffect, useRef, useState } from 'react'
import { useData } from '../data/DataContext'
import { addTrip, updateTrip, type TripInput } from '../data/repo'
import { lastTripType, suggestEngineState } from '../lib/analysis/derive'
import { formatDateTime, fromLocalInput, parseDecimal, toLocalInput } from '../lib/format'
import { ENGINE_LABEL, SITUATION_LABEL, TRIP_TYPE_LABEL } from '../lib/labels'
import { resolveTripLocation } from '../lib/location'
import { SITUATIONS, TRIP_TYPES, type EngineState, type Rating, type Severity, type Situation, type Trip, type TripLocation, type TripType, type Weather } from '../lib/types'
import { fetchWeather } from '../lib/weather'
import { RatingButtons } from './RatingButtons'
import { Button, Card, Chip, ChipGroup, Field, inputClass, OpenMeteoAttribution } from './ui'
import { cx } from './colors'
import { WeatherSummary } from './WeatherSummary'

type PreviewStatus = 'locating' | 'loading' | 'ok' | 'error' | 'nolocation' | 'stored'

interface Preview {
  status: PreviewStatus
  location: TripLocation | null
  weather: Weather | null
  /** Timestamp the weather was fetched for. */
  forTs: number | null
  /** In-flight request, so a save during loading can still attach the result. */
  promise: Promise<Weather> | null
}

const SEVERITY_LABEL: Record<Severity, string> = { 1: '1 · Let', 2: '2 · Tydelig', 3: '3 · Kraftig' }

/**
 * Trip form used both for quick logging (no `initial`) and editing.
 * New trips: rating tap → optional chips → save. Weather is previewed before saving
 * but never blocks it — on failure the trip is saved with weatherStatus "pending".
 */
export function TripForm({ initial, onSaved, footer }: { initial?: Trip; onSaved: (id: string) => void; footer?: React.ReactNode }) {
  const { uid, trips, settings } = useData()
  const editing = initial != null

  const [rating, setRating] = useState<Rating | null>(initial?.rating ?? null)
  const [severity, setSeverity] = useState<Severity | null>(initial?.severity ?? null)
  const [situations, setSituations] = useState<Situation[]>(initial?.situations ?? [])
  const [tripType, setTripType] = useState<TripType>(initial?.tripType ?? lastTripType(trips))
  const [odometer, setOdometer] = useState(initial?.odometer != null ? String(initial.odometer) : '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  /** null = "now" (new trips until the user edits the time). */
  const [timeInput, setTimeInput] = useState<string | null>(initial ? toLocalInput(initial.timestamp) : null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [engineManual, setEngineManual] = useState<EngineState | null>(initial?.engine ?? null)

  const timestamp = timeInput != null ? fromLocalInput(timeInput) : null
  const timeChanged = editing && timestamp != null && Math.abs(timestamp - initial.timestamp) >= 60_000
  const [now] = useState(() => Date.now())
  const engineAuto = suggestEngineState(trips, timestamp ?? now, settings.warmEngineHours, initial?.id)
  const engine = engineManual ?? engineAuto

  // ---------- Weather preview ----------
  const [preview, setPreview] = useState<Preview>(() =>
    initial && initial.weatherStatus === 'ok'
      ? { status: 'stored', location: initial.location, weather: initial.weather, forTs: initial.timestamp, promise: null }
      : { status: 'locating', location: initial?.location ?? null, weather: null, forTs: null, promise: null },
  )
  const locationRef = useRef<Promise<TripLocation | null> | null>(null)
  const getLocation = () => {
    if (!locationRef.current) {
      locationRef.current =
        editing && initial.location
          ? Promise.resolve(initial.location)
          : resolveTripLocation(settings.homeLocation)
    }
    return locationRef.current
  }

  const wantFetch = !editing || timeChanged || initial.weatherStatus !== 'ok'
  const fetchTs = timestamp ?? null
  useEffect(() => {
    if (!wantFetch) return
    if (fetchTs != null && Number.isNaN(fetchTs)) return
    let cancelled = false
    const run = async () => {
      setPreview((p) => ({ ...p, status: p.location ? 'loading' : 'locating', promise: null }))
      const location = await getLocation()
      if (cancelled) return
      if (!location) {
        setPreview({ status: 'nolocation', location: null, weather: null, forTs: null, promise: null })
        return
      }
      const ts = fetchTs ?? Date.now()
      const promise = fetchWeather(location, ts)
      setPreview({ status: 'loading', location, weather: null, forTs: ts, promise })
      try {
        const weather = await promise
        if (!cancelled) setPreview({ status: 'ok', location, weather, forTs: ts, promise })
      } catch {
        if (!cancelled) setPreview({ status: 'error', location, weather: null, forTs: ts, promise: null })
      }
    }
    const timer = setTimeout(run, fetchTs == null ? 0 : 600) // debounce typing in the time field
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // getLocation is stable for the life of the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantFetch, fetchTs])

  // ---------- Save ----------
  const save = () => {
    if (!rating) return
    const ts = timestamp != null && !Number.isNaN(timestamp) ? timestamp : editing ? initial.timestamp : Date.now()
    const problem = rating !== 'good'
    const base: Omit<TripInput, 'location' | 'weather' | 'weatherStatus'> = {
      timestamp: ts,
      rating,
      severity: problem ? severity : null,
      situations: problem ? situations : [],
      engine,
      tripType,
      odometer: parseDecimal(odometer),
      notes: notes.trim(),
    }
    // Keep stored weather when editing without changing the time.
    if (editing && !wantFetch) {
      updateTrip(uid, initial.id, base)
      onSaved(initial.id)
      return
    }
    // Weather fetched for (approximately) this time? Live trips may be saved a few minutes after the preview.
    const fresh = preview.forTs != null && Math.abs(preview.forTs - ts) < 15 * 60_000
    const ready = preview.status === 'ok' && fresh && preview.weather
    const record: TripInput = {
      ...base,
      location: preview.location,
      weatherStatus: ready ? 'ok' : 'pending',
      weather: ready ? preview.weather : null,
    }
    const id = editing ? initial.id : addTrip(uid, record)
    if (editing) updateTrip(uid, id, record)
    // Still loading: attach the result when it arrives; otherwise the backfill picks it up later.
    if (!ready && preview.status === 'loading' && fresh && preview.promise && preview.location) {
      const location = preview.location
      preview.promise.then((weather) => updateTrip(uid, id, { weather, weatherStatus: 'ok', location })).catch(() => {})
    }
    onSaved(id)
  }

  const toggleSituation = (s: Situation) =>
    setSituations((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))

  const problem = rating != null && rating !== 'good'

  return (
    <div className="space-y-4">
      <RatingButtons value={rating} onChange={setRating} />

      {problem && (
        <Card className="space-y-4">
          <ChipGroup label="Hvor slemt? (valgfrit)">
            {([1, 2, 3] as Severity[]).map((s) => (
              <Chip key={s} selected={severity === s} onClick={() => setSeverity(severity === s ? null : s)}>
                {SEVERITY_LABEL[s]}
              </Chip>
            ))}
          </ChipGroup>
          <ChipGroup label="Hvornår skete det? (valgfrit)">
            {SITUATIONS.map((s) => (
              <Chip key={s} selected={situations.includes(s)} onClick={() => toggleSituation(s)}>
                {SITUATION_LABEL[s]}
              </Chip>
            ))}
          </ChipGroup>
        </Card>
      )}

      <Card className="space-y-4">
        <ChipGroup label={`Motor ved start${engineManual == null ? ' (auto)' : ''}`}>
          {(['cold', 'warm'] as EngineState[]).map((e) => (
            <Chip key={e} selected={engine === e} onClick={() => setEngineManual(e)}>
              {ENGINE_LABEL[e]}
            </Chip>
          ))}
        </ChipGroup>
        <ChipGroup label="Turtype">
          {TRIP_TYPES.map((t) => (
            <Chip key={t} selected={tripType === t} onClick={() => setTripType(t)}>
              {TRIP_TYPE_LABEL[t]}
            </Chip>
          ))}
        </ChipGroup>
      </Card>

      <Card testId="weather-preview">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ink-2)]">
            Vejr {timestamp != null ? `· ${formatDateTime(timestamp)}` : 'nu'}
          </h2>
          {preview.location && (
            <span className="text-xs text-[var(--ink-2)]">{preview.location.source === 'gps' ? 'GPS' : 'Hjem'}</span>
          )}
        </div>
        {(preview.status === 'ok' || preview.status === 'stored') && preview.weather ? (
          <WeatherSummary weather={preview.weather} />
        ) : preview.status === 'error' ? (
          <p className="text-sm">Kunne ikke hente vejret. Turen gemmes alligevel, og vejret hentes automatisk senere.</p>
        ) : preview.status === 'nolocation' ? (
          <p className="text-sm">Ingen position. Tillad placering eller sæt en hjemmeposition under Indstillinger. Turen kan stadig gemmes.</p>
        ) : !wantFetch ? (
          <p className="text-sm">Vejret mangler stadig for denne tur.</p>
        ) : (
          <p className="text-sm text-[var(--ink-2)]">{preview.status === 'locating' ? 'Finder position…' : 'Henter vejr…'}</p>
        )}
        <OpenMeteoAttribution className="mt-2" />
      </Card>

      <Card>
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between font-semibold"
          aria-expanded={detailsOpen || editing}
          onClick={() => setDetailsOpen((o) => !o)}
        >
          Tidspunkt, km-tal og noter
          <span aria-hidden className={cx('transition-transform', (detailsOpen || editing) && 'rotate-180')}>
            ▾
          </span>
        </button>
        {(detailsOpen || editing) && (
          <div className="mt-3 space-y-3">
            <Field label="Tidspunkt" hint={timeInput == null ? 'Nu (ændr for at logge en tidligere tur)' : undefined}>
              <input
                type="datetime-local"
                className={inputClass}
                value={timeInput ?? toLocalInput(now)}
                onChange={(e) => setTimeInput(e.target.value)}
                max={toLocalInput(now + 60 * 60_000)}
              />
            </Field>
            <Field label="Kilometertal (valgfrit)">
              <input inputMode="numeric" className={inputClass} value={odometer} onChange={(e) => setOdometer(e.target.value)} placeholder="fx 214500" />
            </Field>
            <Field label="Noter (valgfrit)">
              <textarea className={cx(inputClass, 'min-h-20 py-2')} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </Field>
          </div>
        )}
      </Card>

      {footer}

      <div className="pb-safe sticky bottom-20 z-10 -mx-4 bg-gradient-to-t from-[var(--surface)] via-[var(--surface)] to-transparent px-4 pt-4 pb-2">
        <Button className="min-h-14 w-full text-lg" disabled={!rating} onClick={save}>
          {editing ? 'Gem ændringer' : 'Gem tur'}
        </Button>
      </div>
    </div>
  )
}
