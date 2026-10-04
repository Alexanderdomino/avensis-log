import { buildTripContexts, labelOf } from './analysis/derive'
import type { CarEvent, Settings, Trip } from './types'

export const CSV_COLUMNS = [
  'record_type',
  'id',
  'timestamp',
  'rating',
  'severity',
  'situations',
  'engine',
  'trip_type',
  'odometer_km',
  'notes',
  'lat',
  'lon',
  'location_source',
  'weather_status',
  'temperature_c',
  'humidity_pct',
  'dew_point_c',
  'dew_point_spread_c',
  'precipitation_mm',
  'precip_12h_mm',
  'min_temp_12h_c',
  'weather_code',
  'pressure_hpa',
  'fuel_in_tank',
  'trips_since_fill',
  'trips_since_injector_cleaner',
  'event_type',
  'event_label',
  'liters',
  'fuel_brand',
  'octane',
] as const

type Column = (typeof CSV_COLUMNS)[number]
type Row = Partial<Record<Column, string | number | null | undefined>>

export function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * One CSV with a row per trip and per event, oldest first. Values use "." as decimal
 * separator and ISO 8601 UTC timestamps, so the file imports cleanly into any tool.
 */
export function buildCsv(trips: Trip[], events: CarEvent[], settings: Settings): string {
  const contexts = new Map(buildTripContexts(trips, events, settings.eventTypes).map((c) => [c.trip.id, c]))
  const rows: { ts: number; row: Row }[] = []
  for (const t of trips) {
    const c = contexts.get(t.id)
    const w = t.weather
    rows.push({
      ts: t.timestamp,
      row: {
        record_type: 'trip',
        id: t.id,
        timestamp: new Date(t.timestamp).toISOString(),
        rating: t.rating,
        severity: t.severity,
        situations: t.situations.join('|'),
        engine: t.engine,
        trip_type: t.tripType,
        odometer_km: t.odometer,
        notes: t.notes,
        lat: t.location?.lat,
        lon: t.location?.lon,
        location_source: t.location?.source,
        weather_status: t.weatherStatus,
        temperature_c: w?.temperature,
        humidity_pct: w?.humidity,
        dew_point_c: w?.dewPoint,
        dew_point_spread_c: w?.dewPointSpread,
        precipitation_mm: w?.precipitation,
        precip_12h_mm: w?.precip12h,
        min_temp_12h_c: w?.minTemp12h,
        weather_code: w?.weatherCode,
        pressure_hpa: w?.pressure,
        fuel_in_tank: c?.fuelLabel,
        trips_since_fill: c?.tripsSinceFill,
        trips_since_injector_cleaner: c?.tripsSinceInjectorCleaner,
      },
    })
  }
  for (const e of events) {
    rows.push({
      ts: e.timestamp,
      row: {
        record_type: 'event',
        id: e.id,
        timestamp: new Date(e.timestamp).toISOString(),
        odometer_km: e.odometer,
        notes: e.notes,
        event_type: e.type,
        event_label: labelOf(e.type, settings.eventTypes),
        liters: e.liters,
        fuel_brand: e.fuelBrand,
        octane: e.octane,
      },
    })
  }
  rows.sort((a, b) => a.ts - b.ts)
  const lines = [CSV_COLUMNS.join(','), ...rows.map(({ row }) => CSV_COLUMNS.map((c) => csvEscape(row[c])).join(','))]
  return lines.join('\r\n') + '\r\n'
}
