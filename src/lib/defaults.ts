import type { EventType, Settings } from './types'

export const DEFAULT_EVENT_TYPES: EventType[] = [
  { id: 'fuel_e5', label: 'Benzin E5', kind: 'fuel' },
  { id: 'fuel_e10', label: 'Benzin E10', kind: 'fuel' },
  { id: 'injector_cleaner', label: 'Injektorrens tilsat', kind: 'injector_cleaner' },
  { id: 'oil_topup', label: 'Olie efterfyldt', kind: 'oil_topup' },
  { id: 'oil_change', label: 'Olieskift', kind: 'oil_change' },
  { id: 'coils', label: 'Tændspoler skiftet', kind: 'other' },
  { id: 'spark_plugs', label: 'Tændrør skiftet', kind: 'other' },
  { id: 'workshop', label: 'Værkstedsbesøg', kind: 'other' },
  { id: 'part_replaced', label: 'Del udskiftet', kind: 'other' },
  { id: 'other', label: 'Andet', kind: 'other' },
]

export const DEFAULT_SETTINGS: Settings = {
  eventTypes: DEFAULT_EVENT_TYPES,
  homeLocation: null,
  warmEngineHours: 2,
  beforeAfterWindow: 10,
  minSampleSize: 5,
}

/** Merge a partial stored settings document over the defaults, ignoring malformed values. */
export function withDefaults(stored: Partial<Settings> | undefined | null): Settings {
  const s = stored ?? {}
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  return {
    eventTypes: Array.isArray(s.eventTypes) && s.eventTypes.length > 0 ? s.eventTypes : DEFAULT_EVENT_TYPES,
    homeLocation:
      s.homeLocation && typeof s.homeLocation.lat === 'number' && typeof s.homeLocation.lon === 'number'
        ? s.homeLocation
        : null,
    warmEngineHours: num(s.warmEngineHours, DEFAULT_SETTINGS.warmEngineHours),
    beforeAfterWindow: Math.max(1, Math.round(num(s.beforeAfterWindow, DEFAULT_SETTINGS.beforeAfterWindow))),
    minSampleSize: Math.max(1, Math.round(num(s.minSampleSize, DEFAULT_SETTINGS.minSampleSize))),
  }
}
