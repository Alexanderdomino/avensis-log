# avensis-log

A mobile-first PWA for logging how a 2007 Toyota Avensis T25 2.0 D-4 (1AZ-FSE) drives on each trip, so the
patterns behind an intermittent hesitation/misfire become visible. Suspects: ignition coils (damp weather), injectors (cold
engine, E10), a tired catalytic converter (P0430), plus oil consumption tracking.

Each trip gets a rating ("Kører godt" / "Hakker" / "Ingen power"), a few optional chips, and the weather at the time and
place. Events (fuel fills, injector cleaner, oil, coils, workshop visits…) are logged alongside, and the Insights screen
looks for correlations and before/after effects.

The UI is in Danish. Code and docs are in English.

**Stack:** Vite + React 19 + TypeScript, Tailwind CSS v4, Recharts, React Router, vite-plugin-pwa, Firebase modular SDK
(Auth + Firestore). It is a static SPA with no backend. It talks directly to Firebase and to [Open-Meteo](https://open-meteo.com/).

---

## Local development

Requirements: Node 22+, and Java 21+ for the Firebase emulators.

```bash
npm install
cp .env.example .env.local   # fill in your Firebase web config (see below)
npm run dev                  # http://localhost:5173, against your real Firebase project
```

To develop without touching the real project, use the emulators:

```bash
npm run dev:emu
```

This starts the Auth and Firestore emulators (UI at http://127.0.0.1:4000) and Vite in `emulator` mode
(`.env.emulator` sets `VITE_USE_EMULATORS=true`). In emulator mode the app forces the project ID `demo-avensis`, so it
can't reach a real project even if real env vars are set. The sign-in screen then also offers **"Log ind (emulator)"**,
which signs in as a fake Google user without a popup. That button only exists in emulator builds.

### Environment variables

| Variable | Purpose |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase web config (e.g. `your-project.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | Firebase web config |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase web config |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase web config |
| `VITE_FIREBASE_APP_ID` | Firebase web config |
| `VITE_USE_EMULATORS` | `true` connects to local emulators (set by `.env.emulator`) |
| `VITE_EMULATOR_HOST` | Optional, default `127.0.0.1` |

Find the Firebase values in Firebase console → Project settings → General → Your apps → Web app. They are not secrets
(they ship in the JS bundle). Access is protected by `firestore.rules`.

## Scripts and tests

| Command | What it does |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc -b` |
| `npm test` | Vitest unit tests (analysis engine, weather module, CSV, settings) |
| `npm run test:rules` | Firestore security-rules tests (`@firebase/rules-unit-testing`) against the Firestore emulator |
| `npm run test:e2e` | Playwright e2e tests on an iPhone 13 viewport against the Auth + Firestore emulators |
| `npm run build` | Production build into `dist/` (includes the service worker) |
| `npm run test:all` | All of the above, in order |
| `npm run generate-pwa-assets` | Regenerate PNG icons from `public/favicon.svg` |

`test:rules` and `test:e2e` wrap the test runner in `firebase emulators:exec`, so the emulators start and stop
automatically. `firebase-tools` is a dev dependency, and the first run downloads the emulator JARs.

The e2e tests mock geolocation (Copenhagen) and intercept every Open-Meteo request with deterministic responses
(see `e2e/helpers.ts`), so no real weather API is called. They cover: logging a trip with the weather preview, the quick
fuel event, editing a trip, history and filters, insights, a setting changing the analysis, a weather API outage with
manual and automatic backfill, a pending trip synced from another device, a back-dated trip via the archive API, and CSV
export.

Playwright is pinned to 1.56.1. If your machine has a different Chromium revision, run `npx playwright install chromium`.

## Data model

All data lives under `users/{uid}/` and is readable and writable only by that user (`firestore.rules`):

- `trips/{id}`: `timestamp`, `rating` (`good|hesitates|no_power`), `severity` (1–3 or null), `situations[]`, `engine`
  (`cold|warm`), `tripType` (`city|country|motorway`), `odometer`, `notes`, `location` (`{lat, lon, source: gps|home}`,
  rounded to 2 decimals ≈ 1 km), `weatherStatus` (`ok|pending`), `weather`.
- `events/{id}`: `timestamp`, `type` (an event type id), `odometer`, `liters` (0–100), `fuelBrand`, `octane`, `notes`.
- `settings/app`: `eventTypes[]` (`{id, label, kind}`), `homeLocation`, `warmEngineHours` (default 2),
  `beforeAfterWindow` (default 10), `minSampleSize` (default 5).

Every event type has a **kind** (`fuel`, `injector_cleaner`, `oil_topup`, `oil_change`, `other`). The analysis uses the
kind, not the name, so you can add e.g. "Shell V-Power 98" as a `fuel` type and it counts as fuel in the tank.

Offline: Firestore's persistent IndexedDB cache is enabled. Writes are applied locally right away and queued until the
connection returns, so logging works in a dead zone.

## Weather

Everything is in `src/lib/weather.ts`, with unit tests that use a mocked `fetch`.

1. On the log screen the browser Geolocation API provides a position, rounded to 2 decimals. If permission is denied or it
   times out (8 s), the home location from Settings is used.
2. Open-Meteo is queried with `temperature_2m, relative_humidity_2m, dew_point_2m, precipitation, weather_code,
   surface_pressure`:
   - **Trip logged now** (within 1 h): forecast API `current=` block, plus `past_days=1` hourly data.
   - **Trip within the last 7 days** (back-dated or backfilled): forecast API with `past_days`, hourly, using the hour
     closest to the trip.
   - **Older**: archive API (`archive-api.open-meteo.com`) for the trip day and the day before.
3. Derived values:
   - **Dew point spread** = temperature − dew point. Under ~2 °C the air is close to condensation, the classic condition
     for coil and HT-lead tracking.
   - **Precipitation, last 12 h**: sum of hourly precipitation in (t − 12 h, t].
   - **Minimum temperature, last 12 h**: the overnight cold soak.
4. Weather never blocks saving. If the fetch fails or is still running, the trip is saved with `weatherStatus: "pending"`.
   Pending trips are backfilled with their own timestamp and location (or the home location if they have none):
   automatically when they appear in the app (including trips synced from another device), when the browser comes back
   online, and via **"Hent manglende vejr"** in History and Settings.

Weather data by [Open-Meteo.com](https://open-meteo.com/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The attribution is shown in the app.

## How the analysis works

The engine is in `src/lib/analysis/`. It is pure functions with no React or Firestore, and it is unit tested.

### Problem rate and confidence intervals

**Problem rate** = (trips rated *Hakker* + *Ingen power*) / all trips in the group.

Each rate comes with a **Wilson 95 % confidence interval**. Unlike the naive ± formula, Wilson stays inside 0–100 % and still
makes sense at 0/n and n/n.

How to read it: "29 % (7/24), interval 15–49 %" means the data is consistent with a true problem rate anywhere from about
15 % to 49 %. Wide intervals mean little data. When two groups' intervals **overlap**, the difference could easily be
chance. When they **don't overlap**, the difference is worth taking seriously (the overlap check is conservative).

Groups with fewer trips than **minimum sample size** (Settings, default 5) show "for få ture" instead of a rate.

### Groupings

Bands are lower-bound inclusive.

| Factor | Groups |
|---|---|
| Engine at start | cold / warm |
| Trip type | city / country road / motorway |
| Weather | **rain** (≥ 0.2 mm in the last 12 h, rain now, or a rain/snow/drizzle weather code) → else **fog/damp** (fog code 45/48 or RH ≥ 90 %) → else **dry** |
| Temp − dew point | < 2 °C / 2–5 °C / > 5 °C |
| Relative humidity | < 70 % / 70–89 % / ≥ 90 % |
| Temperature | < 0 / 0–7 / 8–14 / ≥ 15 °C (7.9 °C counts as "0–7") |
| Lowest temp, last 12 h | same bands, using the 12 h minimum |
| Fuel in tank | type of the most recent fuel event at or before the trip |
| Trips since fill | 1–5 / 6–15 / 16+ |
| Trips since injector cleaner | never / 1–5 / 6–15 / 16+ |

Trips without weather yet (pending) are left out of the weather groupings and counted as "ture uden data".

"When did it happen" is only recorded on problem trips, so a per-situation problem rate would always be 100 %. Instead
it is shown as each situation's **share of problem trips**, with the same interval.

**Engine pre-selection:** warm if the previous trip started less than *N* hours earlier (Settings, default 2), otherwise
cold. Back-dated trips compare against the trip before *that* time.

### Strongest signals

For every factor, each group is compared with **all other trips in that factor** (e.g. "temp − dew point < 2 °C" vs
everything ≥ 2 °C). This is only done when both sides reach the minimum sample size. Each factor contributes its single
biggest difference, and factors are ranked by the absolute difference in problem rate (top 5). The result is phrased like:

> Hakker oftere når temp − dugpunkt er under 2 °C: 58 % (7/12) mod 14 % (3/21)

with a note on whether the intervals overlap. **These are correlations, not proof.** Many factors move together (cold
engine and low temperature, damp and rain), so a strong signal is a lead to test, not a diagnosis.

### Before/after events

For every event: the problem rate in the **N trips before** vs the **N trips after** (Settings, default 10). Near the
start or end of the data the windows are simply shorter. A trip at exactly the event's time counts as "after". A row is
**inconclusive** if either side is below the minimum sample size or the two intervals overlap. With 10 trips per side,
only large changes clear that bar (80 % → 10 % does; 70 % → 10 % still overlaps). Keep logging and widen the window to make it more sensitive.

### Oil consumption

Assumes every top-up (and oil change) brings the level back to the same mark. The liters added at a top-up were then
consumed since the previous top-up or oil change:

- per interval: `liters / (km now − km at previous) × 1000` L/1000 km
- rolling: distance-weighted over the last 3 intervals
- overall: total liters / total km across all valid intervals

If a top-up has no odometer reading, it is **interpolated by time** between the nearest odometer readings (from any trip
or event) before and after it. With fewer than two readings around the top-up, or no previous top-up/oil change, that
interval shows "ikke nok data".

## CSV export

Settings → "Eksportér CSV" produces one file with a row per trip and per event, sorted by time. It includes all weather
columns and the derived `fuel_in_tank`, `trips_since_fill` and `trips_since_injector_cleaner`. Timestamps are ISO 8601
UTC, decimals use `.`, and the file is UTF-8 with a BOM so Excel shows æøå correctly.

## Deploying (Firebase + Vercel)

Nothing in this repo deploys automatically. Steps:

### 1. Firebase project

1. Create (or reuse) a project at https://console.firebase.google.com.
2. **Authentication** → Sign-in method → enable **Google**.
3. **Firestore Database** → create a database (production mode, a region near you, e.g. `eur3`).
4. Project settings → General → **Add app → Web**. Copy the config values into the `VITE_FIREBASE_*` variables.

### 2. Deploy the security rules

```bash
npx firebase login
npx firebase use --add          # pick your project, alias e.g. "default" (writes .firebaserc)
npx firebase deploy --only firestore:rules,firestore:indexes
```

Re-run the deploy command whenever `firestore.rules` changes. The app only uses single-field queries, so no composite
indexes are needed.

### 3. Vercel

1. Import the GitHub repo in Vercel (https://vercel.com/new). The framework preset is **Vite**. `vercel.json` already sets
   the build command (`npm run build`), the output directory (`dist`), and the SPA rewrite of all routes to `index.html`
   (deep links like `/indsigt` work on reload).
2. Project → Settings → **Environment Variables**: add all six `VITE_FIREBASE_*` variables (Production + Preview). Do
   **not** set `VITE_USE_EMULATORS`.
3. Deploy.

### 4. Authorize the Vercel domain in Firebase Auth

Firebase console → Authentication → Settings → **Authorized domains** → *Add domain*: add your production domain (e.g.
`avensis-log.vercel.app`, plus any custom domain). Without this, Google sign-in fails with `auth/unauthorized-domain`.
Preview deployments get unique URLs, so either add the ones you need or test sign-in on production only.

### 5. Install on the phone

Open the site in Safari (iOS) or Chrome (Android) → Share/menu → **Add to Home Screen**. The app shell is cached by
the service worker, so the log screen opens and saves trips offline.

Sign-in uses a Google popup, with an automatic fallback to a redirect if the popup is blocked.

## Troubleshooting

**"Kan ikke hente data" / `permission-denied` right after signing in.** Firestore is refusing the reads, which almost
always means the rules from this repo were never deployed. A database created in production mode starts with rules
that deny everything. Fix:

```bash
npx firebase use --add                        # select the project in VITE_FIREBASE_PROJECT_ID
npx firebase deploy --only firestore:rules
```

Then tap "Prøv igen". If it still fails, check in the Firebase console → Firestore → Rules that the deployed rules
contain `match /users/{uid}`. Also check that the app's `VITE_FIREBASE_PROJECT_ID` (in Vercel) is the same project you
deployed to, and that the database is the `(default)` one.

**`auth/unauthorized-domain` when signing in.** Add the Vercel domain under Authentication → Settings → Authorized
domains (see step 4 above).
