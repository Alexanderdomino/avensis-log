import type { EngineState, EventKind, Rating, Situation, TripType } from './types'

/** Danish UI labels. */
export const RATING_LABEL: Record<Rating, string> = {
  good: 'Kører godt',
  hesitates: 'Hakker',
  no_power: 'Ingen power',
}

export const SITUATION_LABEL: Record<Situation, string> = {
  acceleration: 'Under acceleration',
  uphill: 'Op ad bakke / overhaling',
  steady: 'Ved jævn fart',
  idle: 'I tomgang',
  cold_start: 'Lige efter koldstart',
}

export const ENGINE_LABEL: Record<EngineState, string> = {
  cold: 'Kold motor',
  warm: 'Varm motor',
}

export const TRIP_TYPE_LABEL: Record<TripType, string> = {
  city: 'By',
  country: 'Landevej',
  motorway: 'Motorvej',
}

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  fuel: 'Brændstof (tankning)',
  injector_cleaner: 'Injektorrens',
  oil_topup: 'Olie efterfyldt',
  oil_change: 'Olieskift',
  other: 'Andet',
}

/** WMO weather code → short Danish description. */
export function weatherCodeLabel(code: number): string {
  if (code === 0) return 'Klart'
  if (code <= 2) return 'Let skyet'
  if (code === 3) return 'Overskyet'
  if (code === 45 || code === 48) return 'Tåge'
  if (code >= 51 && code <= 57) return 'Støvregn'
  if (code >= 61 && code <= 67) return 'Regn'
  if (code >= 71 && code <= 77) return 'Sne'
  if (code >= 80 && code <= 82) return 'Regnbyger'
  if (code >= 85 && code <= 86) return 'Snebyger'
  if (code >= 95) return 'Torden'
  return `Vejrkode ${code}`
}
