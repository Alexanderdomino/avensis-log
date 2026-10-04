import type { CarEvent, EventType, Trip } from '../types'
import { byTime, kindOf } from './derive'

export interface OdometerReading {
  timestamp: number
  km: number
}

/** Every odometer value logged on a trip or event, oldest first. */
export function odometerReadings(trips: Trip[], events: CarEvent[]): OdometerReading[] {
  return [...trips, ...events]
    .filter((r) => r.odometer != null && r.odometer >= 0)
    .map((r) => ({ timestamp: r.timestamp, km: r.odometer as number }))
    .sort(byTime)
}

/**
 * Odometer at `timestamp`: the record's own reading if it has one, otherwise linear
 * interpolation (by time) between the nearest readings before and after. Needs readings on
 * both sides — extrapolating would be guesswork — so returns null otherwise.
 */
export function odometerAt(timestamp: number, readings: OdometerReading[], own: number | null = null): number | null {
  if (own != null) return own
  const exact = readings.find((r) => r.timestamp === timestamp)
  if (exact) return exact.km
  let before: OdometerReading | null = null
  let after: OdometerReading | null = null
  for (const r of readings) {
    if (r.timestamp < timestamp) before = r
    else if (r.timestamp > timestamp && !after) after = r
  }
  if (!before || !after) return null
  const f = (timestamp - before.timestamp) / (after.timestamp - before.timestamp)
  return Math.round(before.km + f * (after.km - before.km))
}

export interface OilInterval {
  eventId: string
  timestamp: number
  fromKm: number
  toKm: number
  liters: number
  /** Liters per 1000 km for this interval. */
  rate: number
  /** Distance-weighted average of the last ROLLING_INTERVALS intervals, including this one. */
  rolling: number
}

export interface OilTopupStatus {
  event: CarEvent
  /** null → "ikke nok data" (no previous reference, missing liters, or odometer can't be resolved). */
  interval: OilInterval | null
}

export interface OilResult {
  topups: OilTopupStatus[]
  intervals: OilInterval[]
  /** Total liters / total km over all valid intervals × 1000, or null. */
  overall: number | null
}

export const ROLLING_INTERVALS = 3

/**
 * Oil consumption from top-ups. Assumes each top-up (and each oil change) brings the level
 * back to the same mark, so the liters added at a top-up were consumed since the previous
 * top-up or oil change.
 */
export function oilConsumption(trips: Trip[], events: CarEvent[], eventTypes: EventType[]): OilResult {
  const readings = odometerReadings(trips, events)
  const refs = events
    .filter((e) => {
      const k = kindOf(e.type, eventTypes)
      return k === 'oil_topup' || k === 'oil_change'
    })
    .sort(byTime)
  const topups: OilTopupStatus[] = []
  const intervals: OilInterval[] = []
  for (let i = 0; i < refs.length; i++) {
    const ev = refs[i]
    if (kindOf(ev.type, eventTypes) !== 'oil_topup') continue
    const prev = i > 0 ? refs[i - 1] : null
    const toKm = odometerAt(ev.timestamp, readings, ev.odometer)
    const fromKm = prev ? odometerAt(prev.timestamp, readings, prev.odometer) : null
    if (prev == null || toKm == null || fromKm == null || ev.liters == null || ev.liters <= 0 || toKm <= fromKm) {
      topups.push({ event: ev, interval: null })
      continue
    }
    const recent = [...intervals.slice(-(ROLLING_INTERVALS - 1)), { liters: ev.liters, fromKm, toKm }]
    const windowLiters = recent.reduce((a, r) => a + r.liters, 0)
    const windowKm = recent.reduce((a, r) => a + (r.toKm - r.fromKm), 0)
    const interval: OilInterval = {
      eventId: ev.id,
      timestamp: ev.timestamp,
      fromKm,
      toKm,
      liters: ev.liters,
      rate: (ev.liters / (toKm - fromKm)) * 1000,
      rolling: (windowLiters / windowKm) * 1000,
    }
    intervals.push(interval)
    topups.push({ event: ev, interval })
  }
  const liters = intervals.reduce((a, r) => a + r.liters, 0)
  const km = intervals.reduce((a, r) => a + (r.toKm - r.fromKm), 0)
  return { topups, intervals, overall: km > 0 ? (liters / km) * 1000 : null }
}
