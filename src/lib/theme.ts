import type { ThemePreference } from './types'

const KEY = 'theme'

export function getThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(pref: ThemePreference) {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    // storage unavailable (private mode); theme still applies for this session
  }
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}
