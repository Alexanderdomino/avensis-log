import { lazy, Suspense, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router'
import { Button, ToastProvider } from './components/ui'
import { cx } from './components/colors'
import { useAuth } from './data/AuthContext'
import { DataProvider, useData } from './data/DataContext'
import { EventEditScreen, TripEditScreen } from './screens/EditScreens'
import { HistoryScreen } from './screens/HistoryScreen'
import { LogScreen } from './screens/LogScreen'
import { SettingsScreen } from './screens/SettingsScreen'

// Recharts is heavy; load the insights screen on demand so logging opens fast.
const InsightsScreen = lazy(() => import('./screens/InsightsScreen').then((m) => ({ default: m.InsightsScreen })))

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <Splash />
  if (!user) return <SignIn />
  return (
    <DataProvider key={user.uid} uid={user.uid}>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </DataProvider>
  )
}

function Splash() {
  return <div className="flex min-h-dvh items-center justify-center text-[var(--ink-2)]">Indlæser…</div>
}

function SignIn() {
  const { signIn, signInTestUser } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [testEmail, setTestEmail] = useState('test@example.com')
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Avensis-log</h1>
        <p className="mt-2 text-[var(--ink-2)]">Log hvordan bilen kører på hver tur, og find mønstrene bag hakken.</p>
      </div>
      <Button className="min-h-14 text-lg" onClick={() => signIn().catch((e: Error) => setError(e.message))}>
        Log ind med Google
      </Button>
      {signInTestUser && (
        <div className="space-y-2 rounded-xl border border-dashed border-[var(--line)] p-3">
          <p className="text-xs text-[var(--ink-2)]">Emulator: log ind som testbruger</p>
          <input aria-label="Testbruger e-mail" className="w-full rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
          <Button variant="secondary" className="w-full" onClick={() => signInTestUser(testEmail).catch((e: Error) => setError(e.message))}>
            Log ind (emulator)
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-crit">{error}</p>}
    </main>
  )
}

const TABS: [string, string, string][] = [
  ['/', 'Log', 'M12 5v14M5 12h14'],
  ['/historik', 'Historik', 'M4 6h16M4 12h16M4 18h10'],
  ['/indsigt', 'Indsigt', 'M5 19V11M12 19V5M19 19v-6'],
  ['/indstillinger', 'Indstillinger', 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z'],
]

function Shell() {
  const { loading, error } = useData()
  return (
    <div className="mx-auto min-h-dvh max-w-xl">
      <main className="px-4 pb-28">
        {error && <p className="mt-3 rounded-xl border border-crit p-3 text-sm text-crit">Datafejl: {error}</p>}
        {loading ? (
          <Splash />
        ) : (
          <Routes>
            <Route path="/" element={<LogScreen />} />
            <Route path="/historik" element={<HistoryScreen />} />
            <Route path="/indsigt" element={<Suspense fallback={<Splash />}><InsightsScreen /></Suspense>} />
            <Route path="/indstillinger" element={<SettingsScreen />} />
            <Route path="/tur/:id" element={<TripEditScreen />} />
            <Route path="/haendelse/ny" element={<EventEditScreen />} />
            <Route path="/haendelse/:id" element={<EventEditScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-[var(--line)] bg-[var(--card)]/95 backdrop-blur" aria-label="Hovedmenu">
        <ul className="mx-auto grid max-w-xl grid-cols-4">
          {TABS.map(([to, label, d]) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) => cx('flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-semibold', isActive ? 'text-[var(--ink)]' : 'text-[var(--ink-2)]')}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={d} />
                </svg>
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
