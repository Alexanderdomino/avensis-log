import { expect, type Page } from '@playwright/test'

const HOUR = 3600

/** Deterministic Open-Meteo responses: a damp, rainy 4 °C day (dew point spread 0.8 °C). */
export function openMeteoBody(url: URL) {
  const nowSec = Math.floor(Date.now() / 1000)
  const isArchive = url.hostname.startsWith('archive-api')
  const end = isArchive ? Date.parse(url.searchParams.get('end_date')! + 'T23:00:00Z') / 1000 : nowSec + 24 * HOUR
  const start = isArchive ? Date.parse(url.searchParams.get('start_date')! + 'T00:00:00Z') / 1000 : nowSec - 4 * 24 * HOUR
  const time: number[] = []
  for (let t = Math.floor(start / HOUR) * HOUR; t <= end; t += HOUR) time.push(t)
  const body: Record<string, unknown> = {
    latitude: Number(url.searchParams.get('latitude')),
    longitude: Number(url.searchParams.get('longitude')),
    hourly: {
      time,
      temperature_2m: time.map((_, i) => (i % 24 === 3 ? -1.5 : 4)),
      relative_humidity_2m: time.map(() => 95),
      dew_point_2m: time.map(() => 3.2),
      precipitation: time.map((_, i) => (i % 6 === 0 ? 0.5 : 0)),
      weather_code: time.map(() => 61),
      surface_pressure: time.map(() => 1002),
    },
  }
  if (url.searchParams.get('current')) {
    body.current = {
      time: nowSec,
      temperature_2m: 4.2,
      relative_humidity_2m: 95,
      dew_point_2m: 3.4,
      precipitation: 0.2,
      weather_code: 61,
      surface_pressure: 1002,
    }
  }
  return body
}

/** Intercept Open-Meteo. Flip `state.fail` to simulate an outage. Records requested URLs. */
export async function mockWeather(page: Page) {
  const state = { fail: false, requests: [] as string[] }
  await page.route(/https:\/\/(api|archive-api)\.open-meteo\.com\/.*/, async (route) => {
    const url = new URL(route.request().url())
    state.requests.push(url.toString())
    if (state.fail) return route.fulfill({ status: 503, body: 'down' })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(openMeteoBody(url)),
    })
  })
  return state
}

let counter = 0
export async function signIn(page: Page) {
  const email = `e2e-${Date.now()}-${counter++}@example.com`
  await page.goto('/')
  await page.getByLabel('Testbruger e-mail').fill(email)
  await page.getByRole('button', { name: 'Log ind (emulator)' }).click()
  await expect(page.getByRole('heading', { name: 'Ny tur' })).toBeVisible()
  return email
}

export const nav = (page: Page, name: 'Log' | 'Historik' | 'Indsigt' | 'Indstillinger') =>
  page.getByRole('navigation', { name: 'Hovedmenu' }).getByRole('link', { name }).click()

export async function logTrip(page: Page, rating: 'Kører godt' | 'Hakker' | 'Ingen power', opts: { chips?: string[]; waitForWeather?: boolean } = {}) {
  if (opts.waitForWeather !== false) await expect(page.getByTestId('weather-preview')).toContainText('4,2 °C')
  await page.getByRole('radio', { name: rating }).click()
  for (const c of opts.chips ?? []) await page.getByRole('button', { name: c, exact: true }).click()
  await page.getByRole('button', { name: 'Gem tur' }).click()
  await expect(page.getByRole('status')).toHaveText('Tur gemt')
}

// ---------- Direct emulator access (bypasses rules with the emulator's "owner" token) ----------

const PROJECT = 'demo-avensis'
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }

export async function uidFor(email: string): Promise<string> {
  const res = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:query`, { method: 'POST', headers: OWNER, body: '{}' })
  const users = (await res.json()).userInfo as { email: string; localId: string }[]
  return users.find((u) => u.email === email)!.localId
}

function toValue(v: unknown): unknown {
  if (v === null) return { nullValue: null }
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  if (typeof v === 'string') return { stringValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } }
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, toValue(x)])) } }
}

/** Write a document straight into the Firestore emulator, as if from another device. */
export async function writeDoc(path: string, data: Record<string, unknown>) {
  const res = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/${path}`, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)])) }),
  })
  if (!res.ok) throw new Error(await res.text())
}
