import { fmt1 } from '../lib/format'
import { weatherCodeLabel } from '../lib/labels'
import type { Weather } from '../lib/types'

/** Compact weather facts. Dew point spread is highlighted when it signals condensation risk. */
export function WeatherSummary({ weather, compact = false }: { weather: Weather; compact?: boolean }) {
  const damp = weather.dewPointSpread < 2
  if (compact) {
    return (
      <span className="text-xs text-[var(--ink-2)]">
        {fmt1(weather.temperature)} °C · {weather.humidity} % · Δdug {fmt1(weather.dewPointSpread)} °C · {weatherCodeLabel(weather.weatherCode)}
      </span>
    )
  }
  const items: [string, string, boolean?][] = [
    ['Temp.', `${fmt1(weather.temperature)} °C`],
    ['Luftfugt.', `${weather.humidity} %`],
    ['Dugpunkt', `${fmt1(weather.dewPoint)} °C`],
    ['Temp − dugpkt', `${damp ? '⚠ ' : ''}${fmt1(weather.dewPointSpread)} °C`, damp],
    ['Regn 12 t', `${fmt1(weather.precip12h)} mm`],
    ['Min. 12 t', `${fmt1(weather.minTemp12h)} °C`],
  ]
  return (
    <div>
      <div className="mb-2 text-sm font-semibold">{weatherCodeLabel(weather.weatherCode)} · {weather.pressure} hPa</div>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
        {items.map(([k, v, hl]) => (
          <div key={k}>
            <dt className="text-[11px] uppercase tracking-wide text-[var(--ink-2)]">{k}</dt>
            <dd className={hl ? 'font-bold text-amber-700 dark:text-warn' : 'font-semibold'} title={hl ? 'Under 2 °C: risiko for kondens/fugt' : undefined}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
