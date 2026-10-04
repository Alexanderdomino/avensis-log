import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { RATING_COLOR } from '../components/colors'
import { RatingIcon } from '../components/RatingIcon'
import { Button, Card, Field, inputClass, PageHeader, useToast } from '../components/ui'
import { WeatherSummary } from '../components/WeatherSummary'
import { useData } from '../data/DataContext'
import { labelOf } from '../lib/analysis/derive'
import { fmt1, formatDateTime } from '../lib/format'
import { ENGINE_LABEL, RATING_LABEL, SITUATION_LABEL, TRIP_TYPE_LABEL } from '../lib/labels'
import { RATINGS, type CarEvent, type Rating, type Trip } from '../lib/types'

type Item = { kind: 'trip'; ts: number; trip: Trip } | { kind: 'event'; ts: number; event: CarEvent }

export function HistoryScreen() {
  const { trips, events, settings, pendingWeather, backfill, backfilling } = useData()
  const toast = useToast()
  const [ratingFilter, setRatingFilter] = useState<'all' | 'none' | Rating>('all')
  const [eventFilter, setEventFilter] = useState<string>('all')

  const items = useMemo(() => {
    const list: Item[] = []
    if (ratingFilter !== 'none')
      for (const t of trips) if (ratingFilter === 'all' || t.rating === ratingFilter) list.push({ kind: 'trip', ts: t.timestamp, trip: t })
    if (eventFilter !== 'none')
      for (const e of events) if (eventFilter === 'all' || e.type === eventFilter) list.push({ kind: 'event', ts: e.timestamp, event: e })
    return list.sort((a, b) => b.ts - a.ts)
  }, [trips, events, ratingFilter, eventFilter])

  return (
    <div>
      <PageHeader title="Historik" />
      {pendingWeather > 0 && (
        <Card className="mb-3 flex items-center justify-between gap-3">
          <span className="text-sm">{pendingWeather} tur(e) mangler vejr</span>
          <Button
            variant="secondary"
            disabled={backfilling}
            onClick={async () => {
              const r = await backfill()
              if (r) toast(r.failed + r.skipped > 0 ? `Vejr hentet for ${r.updated}, ${r.failed + r.skipped} mangler stadig` : `Vejr hentet for ${r.updated} tur(e)`)
            }}
          >
            {backfilling ? 'Henter…' : 'Hent manglende vejr'}
          </Button>
        </Card>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Field label="Ture">
          <select className={inputClass} value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value as typeof ratingFilter)} aria-label="Filtrer ture">
            <option value="all">Alle ture</option>
            {RATINGS.map((r) => (
              <option key={r} value={r}>
                {RATING_LABEL[r]}
              </option>
            ))}
            <option value="none">Skjul ture</option>
          </select>
        </Field>
        <Field label="Hændelser">
          <select className={inputClass} value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} aria-label="Filtrer hændelser">
            <option value="all">Alle hændelser</option>
            {settings.eventTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
            <option value="none">Skjul hændelser</option>
          </select>
        </Field>
      </div>

      {items.length === 0 ? (
        <p className="py-10 text-center text-[var(--ink-2)]">Ingen ture eller hændelser endnu.</p>
      ) : (
        <ul className="space-y-2" data-testid="history-list">
          {items.map((it) =>
            it.kind === 'trip' ? (
              <li key={`t-${it.trip.id}`}>
                <TripRow trip={it.trip} />
              </li>
            ) : (
              <li key={`e-${it.event.id}`}>
                <Link to={`/haendelse/${it.event.id}`} data-testid="history-event" className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--card)] p-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--line)] text-lg" aria-hidden>
                    🔧
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{labelOf(it.event.type, settings.eventTypes)}</div>
                    <div className="text-xs text-[var(--ink-2)]">
                      {formatDateTime(it.event.timestamp)}
                      {it.event.liters != null && ` · ${fmt1(it.event.liters)} L`}
                      {it.event.odometer != null && ` · ${it.event.odometer} km`}
                      {it.event.fuelBrand && ` · ${it.event.fuelBrand}`}
                    </div>
                    {it.event.notes && <div className="truncate text-xs">{it.event.notes}</div>}
                  </div>
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}

function TripRow({ trip }: { trip: Trip }) {
  const color = RATING_COLOR[trip.rating]
  return (
    <Link to={`/tur/${trip.id}`} data-testid="history-trip" className="flex gap-3 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3" style={{ borderLeft: `6px solid ${color}` }}>
      <span style={{ color }} className="shrink-0">
        <RatingIcon rating={trip.rating} className="h-8 w-8" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">
            {RATING_LABEL[trip.rating]}
            {trip.severity != null && <span className="font-normal text-[var(--ink-2)]"> · grad {trip.severity}</span>}
          </span>
          <span className="shrink-0 text-xs text-[var(--ink-2)]">{formatDateTime(trip.timestamp)}</span>
        </div>
        <div className="text-xs text-[var(--ink-2)]">
          {ENGINE_LABEL[trip.engine]} · {TRIP_TYPE_LABEL[trip.tripType]}
          {trip.odometer != null && ` · ${trip.odometer} km`}
          {trip.situations.length > 0 && ` · ${trip.situations.map((s) => SITUATION_LABEL[s]).join(', ')}`}
        </div>
        <div className="mt-0.5">
          {trip.weatherStatus === 'ok' && trip.weather ? (
            <WeatherSummary weather={trip.weather} compact />
          ) : (
            <span className="rounded bg-[var(--line)] px-1.5 py-0.5 text-xs font-semibold" data-testid="weather-pending">
              Vejr mangler
            </span>
          )}
        </div>
        {trip.notes && <div className="truncate text-xs">{trip.notes}</div>}
      </div>
    </Link>
  )
}
