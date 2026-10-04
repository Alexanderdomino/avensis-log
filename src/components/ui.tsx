import { createContext, useCallback, useContext, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { cx } from './colors'


export function Card({ children, className, title, testId }: { children: ReactNode; className?: string; title?: ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} className={cx('rounded-2xl border border-[var(--line)] bg-[var(--card)] p-4', className)}>
      {title && <h2 className="mb-3 text-base font-semibold">{title}</h2>}
      {children}
    </section>
  )
}

export function Chip({
  selected,
  onClick,
  children,
  className,
  ...rest
}: { selected: boolean; onClick: () => void; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'min-h-11 rounded-full border px-4 text-sm font-medium transition-colors',
        selected
          ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--surface)]'
          : 'border-[var(--line)] bg-[var(--card)] text-[var(--ink)] active:bg-[var(--line)]',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ink-2)]">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

export function Button({ variant = 'primary', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return (
    <button
      type="button"
      className={cx(
        'min-h-11 rounded-xl px-4 font-semibold transition-opacity disabled:opacity-40',
        variant === 'primary' && 'bg-[var(--ink)] text-[var(--surface)] active:opacity-80',
        variant === 'secondary' && 'border border-[var(--line)] bg-[var(--card)] active:bg-[var(--line)]',
        variant === 'danger' && 'bg-crit text-white active:opacity-80',
        className,
      )}
      {...rest}
    />
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[var(--ink-2)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--ink-2)]">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full min-h-11 rounded-xl border border-[var(--line)] bg-[var(--card)] px-3 text-[var(--ink)] focus:outline-2 focus:outline-[var(--series)]'

export function PageHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-2 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
      <h1 className="text-2xl font-bold">{title}</h1>
      {right}
    </header>
  )
}

// ---------- Toast ----------
const ToastContext = createContext<(msg: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMsg(m)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(null), 2500)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      {msg && (
        <div role="status" className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
          <div className="rounded-full bg-[var(--ink)] px-5 py-3 text-sm font-semibold text-[var(--surface)] shadow-lg">{msg}</div>
        </div>
      )}
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext)

export function OpenMeteoAttribution({ className }: { className?: string }) {
  return (
    <p className={cx('text-xs text-[var(--ink-2)]', className)}>
      Vejrdata fra{' '}
      <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">
        Open-Meteo.com
      </a>{' '}
      (
      <a className="underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
        CC BY 4.0
      </a>
      )
    </p>
  )
}
