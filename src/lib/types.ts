/** Domain types shared by the UI, the data layer and the pure analysis engine. */

export type Rating = 'good' | 'hesitates' | 'no_power'
export const RATINGS: readonly Rating[] = ['good', 'hesitates', 'no_power']

export type Severity = 1 | 2 | 3

/** "When did it happen" chips. */
export type Situation = 'acceleration' | 'uphill' | 'steady' | 'idle' | 'cold_start'
export const SITUATIONS: readonly Situation[] = ['acceleration', 'uphill', 'steady', 'idle', 'cold_start']

export type EngineState = 'cold' | 'warm'
export type TripType = 'city' | 'country' | 'motorway'
export const TRIP_TYPES: readonly TripType[] = ['city', 'country', 'motorway']

export type WeatherStatus = 'ok' | 'pending'

export interface GeoPoint {
  /** Rounded to 2 decimals (~1 km) before storing. */
  lat: number
  lon: number
}

export interface TripLocation extends GeoPoint {
  source: 'gps' | 'home'
}

export interface Weather {
  /** °C at the time of the trip. */
  temperature: number
  /** % */
  humidity: number
  /** °C */
  dewPoint: number
  /** temperature − dew point, °C. Main damp/condensation indicator. */
  dewPointSpread: number
  /** mm in the hour around the trip. */
  precipitation: number
  /** WMO weather code. */
  weatherCode: number
  /** hPa */
  pressure: number
  /** mm summed over the 12 hours before the trip. */
  precip12h: number
  /** Lowest temperature over the 12 hours before the trip (overnight cold soak), °C. */
  minTemp12h: number
  source: 'forecast' | 'archive'
}

export interface Trip {
  id: string
  /** Epoch ms. */
  timestamp: number
  rating: Rating
  severity: Severity | null
  situations: Situation[]
  engine: EngineState
  tripType: TripType
  odometer: number | null
  notes: string
  location: TripLocation | null
  weatherStatus: WeatherStatus
  weather: Weather | null
}

/** Analysis-relevant category of an event type. Lets the user add custom types that still count. */
export type EventKind = 'fuel' | 'injector_cleaner' | 'oil_topup' | 'oil_change' | 'other'
export const EVENT_KINDS: readonly EventKind[] = ['fuel', 'injector_cleaner', 'oil_topup', 'oil_change', 'other']

export interface EventType {
  id: string
  label: string
  kind: EventKind
}

export interface CarEvent {
  id: string
  /** Epoch ms. */
  timestamp: number
  /** EventType.id */
  type: string
  odometer: number | null
  liters: number | null
  fuelBrand: string
  octane: number | null
  notes: string
}

export type ThemePreference = 'system' | 'light' | 'dark'

export interface Settings {
  eventTypes: EventType[]
  homeLocation: GeoPoint | null
  /** Engine is pre-selected as warm if the previous trip was less than this many hours ago. */
  warmEngineHours: number
  /** Number of trips before/after each event used in the before/after comparison. */
  beforeAfterWindow: number
  /** Minimum trips in a group before a rate is shown. */
  minSampleSize: number
}
