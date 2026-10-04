import { useState } from 'react'
import { Button, Card, Chip, ChipGroup, Field, inputClass, OpenMeteoAttribution, PageHeader, useToast } from '../components/ui'
import { useAuth } from '../data/AuthContext'
import { useData } from '../data/DataContext'
import { saveSettings } from '../data/repo'
import { buildCsv } from '../lib/csv'
import { parseDecimal } from '../lib/format'
import { EVENT_KIND_LABEL } from '../lib/labels'
import { getBrowserPosition } from '../lib/location'
import { getThemePreference, applyTheme } from '../lib/theme'
import { EVENT_KINDS, type EventKind, type EventType, type ThemePreference } from '../lib/types'
import { roundCoord } from '../lib/weather'

const THEMES: [ThemePreference, string][] = [
  ['system', 'System'],
  ['light', 'Lys'],
  ['dark', 'Mørk'],
]

export function SettingsScreen() {
  const { uid, settings, trips, events, pendingWeather, backfill, backfilling } = useData()
  const { user, signOut } = useAuth()
  const toast = useToast()
  const [theme, setTheme] = useState(getThemePreference)

  const [eventTypes, setEventTypes] = useState<EventType[]>(settings.eventTypes)
  const [lat, setLat] = useState(settings.homeLocation ? String(settings.homeLocation.lat) : '')
  const [lon, setLon] = useState(settings.homeLocation ? String(settings.homeLocation.lon) : '')
  const [warm, setWarm] = useState(String(settings.warmEngineHours))
  const [windowSize, setWindowSize] = useState(String(settings.beforeAfterWindow))
  const [minSample, setMinSample] = useState(String(settings.minSampleSize))
  const [newLabel, setNewLabel] = useState('')
  const [newKind, setNewKind] = useState<EventKind>('other')

  const latN = parseDecimal(lat)
  const lonN = parseDecimal(lon)
  const warmN = parseDecimal(warm)
  const windowN = parseDecimal(windowSize)
  const minN = parseDecimal(minSample)
  const errors = [
    (lat || lon) && (latN == null || lonN == null || Math.abs(latN) > 90 || Math.abs(lonN) > 180) && 'Ugyldig hjemmeposition',
    (warmN == null || warmN < 0 || warmN > 48) && 'Varm motor: 0–48 timer',
    (windowN == null || !Number.isInteger(windowN) || windowN < 1 || windowN > 100) && 'Før/efter-vindue: 1–100 ture',
    (minN == null || !Number.isInteger(minN) || minN < 1 || minN > 100) && 'Mindste antal ture: 1–100',
    eventTypes.some((t) => !t.label.trim()) && 'Alle hændelsestyper skal have et navn',
  ].filter(Boolean) as string[]

  const save = () => {
    if (errors.length) return
    saveSettings(uid, {
      eventTypes: eventTypes.map((t) => ({ ...t, label: t.label.trim() })),
      homeLocation: latN != null && lonN != null ? { lat: roundCoord(latN), lon: roundCoord(lonN) } : null,
      warmEngineHours: warmN!,
      beforeAfterWindow: windowN!,
      minSampleSize: minN!,
    })
    toast('Indstillinger gemt')
  }

  const useCurrentPosition = async () => {
    const p = await getBrowserPosition()
    if (!p) return toast('Kunne ikke finde position')
    setLat(String(roundCoord(p.lat)))
    setLon(String(roundCoord(p.lon)))
  }

  const addType = () => {
    const label = newLabel.trim()
    if (!label) return
    const slug = label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'type'
    setEventTypes((ts) => [...ts, { id: `${slug}_${Math.random().toString(36).slice(2, 6)}`, label, kind: newKind }])
    setNewLabel('')
  }

  const exportCsv = () => {
    const csv = buildCsv(trips, events, settings)
    // BOM so Excel detects UTF-8 (æøå).
    const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `avensis-log-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Indstillinger" />

      <Card title="Analyse">
        <div className="space-y-3">
          <Field label="Varm motor hvis forrige tur var for under (timer)">
            <input inputMode="decimal" className={inputClass} value={warm} onChange={(e) => setWarm(e.target.value)} />
          </Field>
          <Field label="Før/efter-vindue (antal ture)">
            <input inputMode="numeric" className={inputClass} value={windowSize} onChange={(e) => setWindowSize(e.target.value)} />
          </Field>
          <Field label="Mindste antal ture for at vise en rate" hint="Grupper med færre ture vises som “for få ture”.">
            <input inputMode="numeric" className={inputClass} value={minSample} onChange={(e) => setMinSample(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Hjemmeposition">
        <p className="mb-3 text-sm text-[var(--ink-2)]">Bruges til vejret, hvis telefonens position ikke er tilgængelig. Gemmes med 2 decimaler (ca. 1 km).</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Breddegrad">
            <input inputMode="decimal" className={inputClass} value={lat} onChange={(e) => setLat(e.target.value)} placeholder="55,68" />
          </Field>
          <Field label="Længdegrad">
            <input inputMode="decimal" className={inputClass} value={lon} onChange={(e) => setLon(e.target.value)} placeholder="12,57" />
          </Field>
        </div>
        <Button variant="secondary" className="mt-3 w-full" onClick={useCurrentPosition}>
          Brug nuværende position
        </Button>
      </Card>

      <Card title="Hændelsestyper">
        <p className="mb-3 text-sm text-[var(--ink-2)]">“Kategori” styrer analysen: brændstof bestemmer hvad der er i tanken, olie efterfyldt bruges til olieforbrug.</p>
        <ul className="space-y-2">
          {eventTypes.map((t, i) => (
            <li key={t.id} className="grid grid-cols-[1fr_auto] gap-2 border-b border-[var(--line)] pb-2 last:border-0">
              <input
                aria-label="Navn"
                className={inputClass}
                value={t.label}
                onChange={(e) => setEventTypes((ts) => ts.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              />
              <button type="button" aria-label={`Fjern ${t.label}`} className="min-h-11 min-w-11 rounded-xl border border-[var(--line)]" onClick={() => setEventTypes((ts) => ts.filter((_, j) => j !== i))}>
                ✕
              </button>
              <select
                aria-label="Kategori"
                className={`${inputClass} col-span-2`}
                value={t.kind}
                onChange={(e) => setEventTypes((ts) => ts.map((x, j) => (j === i ? { ...x, kind: e.target.value as EventKind } : x)))}
              >
                {EVENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    Kategori: {EVENT_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <input aria-label="Ny type" className={inputClass} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ny type, fx Benzin 98" />
          <Button variant="secondary" onClick={addType} aria-label="Tilføj type">
            ＋
          </Button>
          <select aria-label="Ny types kategori" className={`${inputClass} col-span-2`} value={newKind} onChange={(e) => setNewKind(e.target.value as EventKind)}>
            {EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {EVENT_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {errors.length > 0 && (
        <ul className="rounded-xl border border-crit p-3 text-sm text-crit">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <Button className="min-h-12 w-full" onClick={save} disabled={errors.length > 0}>
        Gem indstillinger
      </Button>

      <Card title="Udseende">
        <ChipGroup label="Tema">
          {THEMES.map(([value, label]) => (
            <Chip
              key={value}
              selected={theme === value}
              onClick={() => {
                setTheme(value)
                applyTheme(value)
              }}
            >
              {label}
            </Chip>
          ))}
        </ChipGroup>
      </Card>

      <Card title="Data">
        <div className="space-y-2">
          <Button variant="secondary" className="w-full" onClick={exportCsv}>
            Eksportér CSV ({trips.length} ture, {events.length} hændelser)
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            disabled={backfilling || pendingWeather === 0}
            onClick={async () => {
              const r = await backfill()
              if (r) toast(`Vejr hentet for ${r.updated} tur(e)`)
            }}
          >
            Hent manglende vejr ({pendingWeather})
          </Button>
        </div>
        <OpenMeteoAttribution className="mt-3" />
      </Card>

      <Card title="Konto">
        <p className="mb-3 text-sm">Logget ind som {user?.email ?? user?.displayName}</p>
        <Button variant="secondary" className="w-full" onClick={() => void signOut()}>
          Log ud
        </Button>
      </Card>
    </div>
  )
}
