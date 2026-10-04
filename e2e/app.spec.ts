import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { logTrip, mockWeather, nav, setEmulatorRules, signIn, uidFor, writeDoc } from './helpers'

test('log a trip and a fuel event, edit the trip, see both in history and insights', async ({ page }) => {
  const weather = await mockWeather(page)
  await signIn(page)

  // Weather preview is visible before saving, using rounded GPS coordinates.
  const preview = page.getByTestId('weather-preview')
  await expect(preview).toContainText('4,2 °C')
  await expect(preview).toContainText('0,8 °C') // temp − dew point
  await expect(preview).toContainText('GPS')
  await expect(preview).toContainText('Open-Meteo.com')
  const first = new URL(weather.requests[0])
  expect(first.searchParams.get('latitude')).toBe('55.68')
  expect(first.searchParams.get('longitude')).toBe('12.57')
  expect(first.searchParams.get('past_days')).toBe('1')

  // First trip of the day: engine auto-selected cold.
  await expect(page.getByRole('group', { name: /Motor ved start/ }).getByRole('button', { name: 'Kold motor' })).toHaveAttribute('aria-pressed', 'true')
  await logTrip(page, 'Hakker', { chips: ['2 · Tydelig', 'Under acceleration'] })

  // Next trip right after: auto warm.
  await expect(page.getByRole('group', { name: /Motor ved start/ }).getByRole('button', { name: 'Varm motor' })).toHaveAttribute('aria-pressed', 'true')

  // Quick fuel event with the default fuel type preselected.
  await page.getByRole('button', { name: /Tanket/ }).click()
  await expect(page.getByRole('heading', { name: 'Ny hændelse' })).toBeVisible()
  await expect(page.getByLabel('Type')).toHaveValue('fuel_e5')
  await page.getByRole('button', { name: 'Benzin E10', exact: true }).click()
  await page.getByLabel('Liter (valgfrit)').fill('45,5')
  await page.getByLabel('Mærke/station').fill('Q8')
  await page.getByRole('button', { name: 'Gem hændelse' }).click()
  await expect(page.getByRole('status')).toHaveText('Hændelse gemt')
  // Last used fuel type is now preselected on the quick button.
  await expect(page.getByRole('button', { name: /Tanket/ })).toContainText('Benzin E10')

  // History shows both, newest first.
  await nav(page, 'Historik')
  const trips = page.getByTestId('history-trip')
  const events = page.getByTestId('history-event')
  await expect(trips).toHaveCount(1)
  await expect(events).toHaveCount(1)
  await expect(trips.first()).toContainText('Hakker')
  await expect(trips.first()).toContainText('grad 2')
  await expect(events.first()).toContainText('Benzin E10')
  await expect(events.first()).toContainText('45,5 L')

  // Edit the trip.
  await trips.first().click()
  await expect(page.getByRole('heading', { name: 'Rediger tur' })).toBeVisible()
  await page.getByRole('radio', { name: 'Ingen power' }).click()
  await page.getByLabel('Kilometertal (valgfrit)').fill('214500')
  await page.getByRole('button', { name: 'Gem ændringer' }).click()
  await expect(page.getByRole('status')).toHaveText('Tur opdateret')
  await expect(trips.first()).toContainText('Ingen power')
  await expect(trips.first()).toContainText('214500 km')

  // Filters.
  await page.getByLabel('Filtrer ture').selectOption('good')
  await expect(trips).toHaveCount(0)
  await expect(events).toHaveCount(1)
  await page.getByLabel('Filtrer ture').selectOption('all')
  await page.getByLabel('Filtrer hændelser').selectOption('none')
  await expect(events).toHaveCount(0)
  await expect(trips).toHaveCount(1)

  // Insights.
  await nav(page, 'Indsigt')
  await expect(page.getByTestId('overall-rate')).toContainText('for få ture (1)')
  await expect(page.getByTestId('timeline')).toContainText('Benzin E10')
  await expect(page.getByTestId('timeline').locator('.recharts-scatter-symbol')).toHaveCount(1)
  const ba = page.getByTestId('before-after')
  await expect(ba.locator('tbody tr')).toHaveCount(1)
  await expect(ba).toContainText('Benzin E10')
  await expect(ba).toContainText('100 % (1/1)')
  await expect(ba).toContainText('For få ture')
  await expect(page.getByTestId('scatter').locator('.recharts-scatter-symbol')).toHaveCount(1)
})

test('changing a setting changes the analysis', async ({ page }) => {
  await mockWeather(page)
  await signIn(page)
  await logTrip(page, 'Hakker')
  await logTrip(page, 'Kører godt')

  await nav(page, 'Indsigt')
  await expect(page.getByTestId('overall-rate')).toContainText('for få ture (2)')
  await expect(page.getByTestId('signals')).toContainText('Ingen signaler endnu')

  await nav(page, 'Indstillinger')
  await page.getByLabel('Mindste antal ture for at vise en rate').fill('1')
  await page.getByRole('button', { name: 'Gem indstillinger' }).click()
  await expect(page.getByRole('status')).toHaveText('Indstillinger gemt')

  await nav(page, 'Indsigt')
  await expect(page.getByTestId('overall-rate')).toContainText('50 % (1/2)')
  // Cold vs warm engine now meets the minimum sample on both sides.
  await expect(page.getByTestId('signals')).toContainText('Hakker oftere med kold motor: 100 % (1/1) mod 0 % (0/1)')

  // Settings persist across reloads.
  await page.reload()
  await nav(page, 'Indstillinger')
  await expect(page.getByLabel('Mindste antal ture for at vise en rate')).toHaveValue('1')
})

test('weather API failure saves the trip as pending and backfills later', async ({ page }) => {
  const weather = await mockWeather(page)
  weather.fail = true
  await signIn(page)

  await expect(page.getByTestId('weather-preview')).toContainText('Kunne ikke hente vejret')
  await logTrip(page, 'Hakker', { waitForWeather: false })

  await nav(page, 'Historik')
  await expect(page.getByTestId('weather-pending')).toHaveCount(1)
  await expect(page.getByText('1 tur(e) mangler vejr')).toBeVisible()

  // Manual backfill once the API is back.
  weather.fail = false
  await page.getByRole('button', { name: 'Hent manglende vejr' }).click()
  await expect(page.getByTestId('weather-pending')).toHaveCount(0)
  await expect(page.getByTestId('history-trip').first()).toContainText('Δdug 0,8 °C')

  // Automatic backfill on next app open.
  weather.fail = true
  await nav(page, 'Log')
  await expect(page.getByTestId('weather-preview')).toContainText('Kunne ikke hente vejret')
  await logTrip(page, 'Kører godt', { waitForWeather: false })
  await nav(page, 'Historik')
  await expect(page.getByTestId('weather-pending')).toHaveCount(1)
  weather.fail = false
  const before = weather.requests.length
  await page.reload()
  await expect(page.getByTestId('history-trip')).toHaveCount(2)
  await expect(page.getByTestId('weather-pending')).toHaveCount(0)
  // The backfill used the trip's own stored location and timestamp (current trip → forecast API).
  const backfillReq = weather.requests.slice(before).map((u) => new URL(u))
  expect(backfillReq.some((u) => u.hostname === 'api.open-meteo.com' && u.searchParams.get('latitude') === '55.68')).toBe(true)
})

test('a pending trip synced from another device is backfilled automatically', async ({ page }) => {
  const weather = await mockWeather(page)
  const email = await signIn(page)
  await nav(page, 'Historik')
  await expect(page.getByText('Ingen ture eller hændelser endnu.')).toBeVisible()
  // Logged offline on another device three days ago; never seen by this client's cache.
  const ts = Date.now() - 3 * 24 * 3600_000
  await writeDoc(`users/${await uidFor(email)}/trips/from-other-device`, {
    timestamp: new Date(ts),
    rating: 'hesitates',
    severity: null,
    situations: [],
    engine: 'cold',
    tripType: 'country',
    odometer: null,
    notes: '',
    location: { lat: 56.16, lon: 10.21, source: 'gps' },
    weatherStatus: 'pending',
    weather: null,
  })
  await expect(page.getByTestId('history-trip')).toHaveCount(1)
  await expect(page.getByTestId('weather-pending')).toHaveCount(0)
  await expect(page.getByTestId('history-trip')).toContainText('Δdug 0,8 °C')
  const req = weather.requests.map((u) => new URL(u)).find((u) => u.searchParams.get('latitude') === '56.16')!
  expect(req.hostname).toBe('api.open-meteo.com')
  expect(Number(req.searchParams.get('past_days'))).toBeGreaterThanOrEqual(4)
  expect(req.searchParams.get('current')).toBeNull()
})

test('back-dated trip fetches weather for the logged time via the archive API', async ({ page }) => {
  const weather = await mockWeather(page)
  await signIn(page)
  await expect(page.getByTestId('weather-preview')).toContainText('4,2 °C')
  await page.getByRole('button', { name: 'Tidspunkt, km-tal og noter' }).click()
  await page.getByLabel('Tidspunkt').fill('2026-03-15T08:30')
  await expect.poll(() => weather.requests.some((u) => u.includes('archive-api') && u.includes('end_date=2026-03-15'))).toBe(true)
  await expect(page.getByTestId('weather-preview')).toContainText('4 °C')
  await page.getByRole('radio', { name: 'Hakker' }).click()
  await page.getByRole('button', { name: 'Gem tur' }).click()
  await expect(page.getByRole('status')).toHaveText('Tur gemt')
  await nav(page, 'Historik')
  await expect(page.getByTestId('history-trip').first()).toContainText('15. mar')
  await expect(page.getByTestId('weather-pending')).toHaveCount(0)
})

test('export CSV with trips and events', async ({ page }) => {
  await mockWeather(page)
  await signIn(page)
  await logTrip(page, 'Hakker', { chips: ['Ved jævn fart'] })
  await page.getByRole('button', { name: /Olie efterfyldt/ }).click()
  await page.getByLabel('Liter (valgfrit)').fill('0,5')
  await page.getByRole('button', { name: 'Gem hændelse' }).click()
  await expect(page.getByRole('status')).toHaveText('Hændelse gemt')

  await nav(page, 'Indstillinger')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Eksportér CSV \(1 ture, 1 hændelser\)/ }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^avensis-log-\d{4}-\d{2}-\d{2}\.csv$/)
  const csv = readFileSync((await download.path())!, 'utf8').replace(/^\uFEFF/, '')
  const lines = csv.trim().split('\r\n')
  expect(lines).toHaveLength(3)
  const header = lines[0].split(',')
  expect(header).toContain('dew_point_spread_c')
  expect(header).toContain('precip_12h_mm')
  const rows = lines.slice(1).map((l) => Object.fromEntries(l.split(',').map((v, i) => [header[i], v])))
  const trip = rows.find((r) => r.record_type === 'trip')!
  const event = rows.find((r) => r.record_type === 'event')!
  expect(trip.rating).toBe('hesitates')
  expect(trip.situations).toBe('steady')
  expect(trip.temperature_c).toBe('4.2')
  expect(trip.dew_point_spread_c).toBe('0.8')
  expect(trip.weather_status).toBe('ok')
  expect(event.event_label).toBe('Olie efterfyldt')
  expect(event.liters).toBe('0.5')
})

test('shows a helpful error instead of an endless spinner when Firestore denies access', async ({ page }) => {
  await mockWeather(page)
  // A fresh production-mode database: deny everything until firestore.rules is deployed.
  await setEmulatorRules("rules_version = '2';\nservice cloud.firestore { match /databases/{db}/documents { match /{d=**} { allow read, write: if false; } } }")
  try {
    await page.goto('/')
    await page.getByLabel('Testbruger e-mail').fill(`denied-${Date.now()}@example.com`)
    await page.getByRole('button', { name: 'Log ind (emulator)' }).click()
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Kan ikke hente data')
    await expect(alert).toContainText('firebase deploy --only firestore:rules')
    await expect(alert).toContainText('permission-denied')
    await expect(page.getByText('Indlæser…')).toHaveCount(0)

    // Once the real rules are in place, "Prøv igen" recovers.
    await setEmulatorRules(readFileSync('firestore.rules', 'utf8'))
    await page.getByRole('button', { name: 'Prøv igen' }).click()
    await expect(page.getByRole('heading', { name: 'Ny tur' })).toBeVisible()
  } finally {
    await setEmulatorRules(readFileSync('firestore.rules', 'utf8'))
  }
})
