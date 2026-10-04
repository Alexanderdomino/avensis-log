import { ENGINE_LABEL, SITUATION_LABEL, TRIP_TYPE_LABEL } from '../labels'
import type { EventType, Situation, Weather } from '../types'
import { SITUATIONS } from '../types'
import type { TripContext } from './derive'
import { isProblem, rateStat, type RateStat } from './stats'

/**
 * Band boundaries. All bands are lower-bound inclusive, e.g. a dew point spread of exactly
 * 2.0 °C is in "2–5 °C", and 5.0 °C is still "2–5 °C" (the top band is strictly "over 5").
 */
export type DewSpreadBand = 'lt2' | '2to5' | 'gt5'
export function dewSpreadBand(spread: number): DewSpreadBand {
  if (spread < 2) return 'lt2'
  if (spread <= 5) return '2to5'
  return 'gt5'
}

export type HumidityBand = 'lt70' | '70to89' | 'gte90'
export function humidityBand(rh: number): HumidityBand {
  if (rh < 70) return 'lt70'
  if (rh < 90) return '70to89'
  return 'gte90'
}

/** <0, 0–7, 8–14, 15+ °C. Decimal temperatures fall in the band of their lower bound (7.9 → "0–7"). */
export type TempBand = 'lt0' | '0to7' | '8to14' | 'gte15'
export function tempBand(t: number): TempBand {
  if (t < 0) return 'lt0'
  if (t < 8) return '0to7'
  if (t < 15) return '8to14'
  return 'gte15'
}

export type WeatherCondition = 'dry' | 'rain' | 'damp'
/** Rain wins over damp: any measurable rain in the last 12 h, or rain/snow/drizzle now. */
export const RAIN_THRESHOLD_MM = 0.2
const isWetCode = (c: number) => (c >= 51 && c <= 67) || (c >= 71 && c <= 77) || (c >= 80 && c <= 86) || c >= 95
const isFogCode = (c: number) => c === 45 || c === 48
export const DAMP_HUMIDITY = 90
export function weatherCondition(w: Weather): WeatherCondition {
  if (w.precip12h >= RAIN_THRESHOLD_MM || w.precipitation > 0 || isWetCode(w.weatherCode)) return 'rain'
  if (isFogCode(w.weatherCode) || w.humidity >= DAMP_HUMIDITY) return 'damp'
  return 'dry'
}

export type SinceBand = '1to5' | '6to15' | 'gte16'
export function sinceBand(n: number): SinceBand {
  if (n <= 5) return '1to5'
  if (n <= 15) return '6to15'
  return 'gte16'
}

export interface GroupDef {
  key: string
  /** Short label for chart axes. */
  label: string
  /** Condition phrase for "Hakker oftere {phrase}: …". */
  phrase: string
}

export interface Grouping {
  id: string
  title: string
  groups: GroupDef[]
  /** Group key for a trip, or null if the trip can't be classified (e.g. no weather yet). */
  keyOf: (ctx: TripContext) => string | null
}

const TEMP_GROUPS = (prefix: string): GroupDef[] => [
  { key: 'lt0', label: 'Under 0 °C', phrase: `${prefix} under 0 °C` },
  { key: '0to7', label: '0–7 °C', phrase: `${prefix} 0–7 °C` },
  { key: '8to14', label: '8–14 °C', phrase: `${prefix} 8–14 °C` },
  { key: 'gte15', label: '15 °C+', phrase: `${prefix} 15 °C eller mere` },
]

const weatherKey = (fn: (w: Weather) => string) => (ctx: TripContext) =>
  ctx.trip.weatherStatus === 'ok' && ctx.trip.weather ? fn(ctx.trip.weather) : null

/** All problem-rate groupings. Fuel groups depend on the user's event types. */
export function buildGroupings(eventTypes: EventType[]): Grouping[] {
  return [
    {
      id: 'engine',
      title: 'Motor ved start',
      groups: [
        { key: 'cold', label: ENGINE_LABEL.cold, phrase: 'med kold motor' },
        { key: 'warm', label: ENGINE_LABEL.warm, phrase: 'med varm motor' },
      ],
      keyOf: (c) => c.trip.engine,
    },
    {
      id: 'tripType',
      title: 'Turtype',
      groups: [
        { key: 'city', label: TRIP_TYPE_LABEL.city, phrase: 'ved bykørsel' },
        { key: 'country', label: TRIP_TYPE_LABEL.country, phrase: 'på landevej' },
        { key: 'motorway', label: TRIP_TYPE_LABEL.motorway, phrase: 'på motorvej' },
      ],
      keyOf: (c) => c.trip.tripType,
    },
    {
      id: 'weather',
      title: 'Vejr',
      groups: [
        { key: 'dry', label: 'Tørt', phrase: 'i tørt vejr' },
        { key: 'rain', label: 'Regn sidste 12 t', phrase: 'når det har regnet inden for 12 timer' },
        { key: 'damp', label: 'Tåge/fugtigt', phrase: 'i tåge eller fugtigt vejr' },
      ],
      keyOf: weatherKey(weatherCondition),
    },
    {
      id: 'dewSpread',
      title: 'Temp − dugpunkt',
      groups: [
        { key: 'lt2', label: 'Under 2 °C', phrase: 'når temp − dugpunkt er under 2 °C' },
        { key: '2to5', label: '2–5 °C', phrase: 'når temp − dugpunkt er 2–5 °C' },
        { key: 'gt5', label: 'Over 5 °C', phrase: 'når temp − dugpunkt er over 5 °C' },
      ],
      keyOf: weatherKey((w) => dewSpreadBand(w.dewPointSpread)),
    },
    {
      id: 'humidity',
      title: 'Luftfugtighed',
      groups: [
        { key: 'lt70', label: 'Under 70 %', phrase: 'ved luftfugtighed under 70 %' },
        { key: '70to89', label: '70–89 %', phrase: 'ved luftfugtighed på 70–89 %' },
        { key: 'gte90', label: '90 %+', phrase: 'ved luftfugtighed på 90 % eller mere' },
      ],
      keyOf: weatherKey((w) => humidityBand(w.humidity)),
    },
    {
      id: 'temperature',
      title: 'Temperatur',
      groups: TEMP_GROUPS('ved temperatur'),
      keyOf: weatherKey((w) => tempBand(w.temperature)),
    },
    {
      id: 'overnightMin',
      title: 'Laveste temp. sidste 12 t',
      groups: TEMP_GROUPS('når laveste temperatur de sidste 12 timer var'),
      keyOf: weatherKey((w) => tempBand(w.minTemp12h)),
    },
    {
      id: 'fuel',
      title: 'Brændstof i tanken',
      groups: eventTypes
        .filter((t) => t.kind === 'fuel')
        .map((t) => ({ key: t.id, label: t.label, phrase: `med ${t.label} i tanken` })),
      keyOf: (c) => c.fuelTypeId,
    },
    {
      id: 'sinceFill',
      title: 'Ture siden tankning',
      groups: [
        { key: '1to5', label: '1–5', phrase: 'på de første 5 ture efter tankning' },
        { key: '6to15', label: '6–15', phrase: '6–15 ture efter tankning' },
        { key: 'gte16', label: '16+', phrase: 'mere end 15 ture efter tankning' },
      ],
      keyOf: (c) => (c.tripsSinceFill == null ? null : sinceBand(c.tripsSinceFill)),
    },
    {
      id: 'sinceCleaner',
      title: 'Ture siden injektorrens',
      groups: [
        { key: 'none', label: 'Aldrig', phrase: 'før første injektorrens' },
        { key: '1to5', label: '1–5', phrase: 'på de første 5 ture efter injektorrens' },
        { key: '6to15', label: '6–15', phrase: '6–15 ture efter injektorrens' },
        { key: 'gte16', label: '16+', phrase: 'mere end 15 ture efter injektorrens' },
      ],
      keyOf: (c) => (c.tripsSinceInjectorCleaner == null ? 'none' : sinceBand(c.tripsSinceInjectorCleaner)),
    },
  ]
}

export interface GroupResult extends GroupDef {
  stat: RateStat
}

export interface GroupingResult {
  id: string
  title: string
  groups: GroupResult[]
  /** Trips that couldn't be classified (e.g. weather still pending). */
  unclassified: number
}

export function groupProblemRates(contexts: TripContext[], grouping: Grouping, minSample: number): GroupingResult {
  const counts = new Map<string, { problems: number; total: number }>()
  let unclassified = 0
  for (const c of contexts) {
    const key = grouping.keyOf(c)
    if (key == null) {
      unclassified++
      continue
    }
    const entry = counts.get(key) ?? { problems: 0, total: 0 }
    entry.total++
    if (isProblem(c.trip)) entry.problems++
    counts.set(key, entry)
  }
  return {
    id: grouping.id,
    title: grouping.title,
    unclassified,
    groups: grouping.groups.map((g) => {
      const e = counts.get(g.key) ?? { problems: 0, total: 0 }
      return { ...g, stat: rateStat(e.problems, e.total, minSample) }
    }),
  }
}

export interface SituationShare {
  situation: Situation
  label: string
  /** problems = problem trips mentioning this situation, total = all problem trips. */
  stat: RateStat
}

/**
 * "When did it happen" is only recorded for problem trips, so a per-situation problem rate
 * would always be 100 %. Instead we report each situation's share of problem trips.
 */
export function situationShares(contexts: TripContext[], minSample: number): SituationShare[] {
  const problems = contexts.filter((c) => isProblem(c.trip))
  return SITUATIONS.map((s) => ({
    situation: s,
    label: SITUATION_LABEL[s],
    stat: rateStat(problems.filter((c) => c.trip.situations.includes(s)).length, problems.length, minSample),
  }))
}
