import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { auth, USE_EMULATORS } from './firebase'

interface AuthState {
  user: User | null
  loading: boolean
  signIn: () => Promise<void>
  /** Emulator only: sign in as a fake Google user without the popup (used by e2e tests). */
  signInTestUser?: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser)
  const [loading, setLoading] = useState(true)

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u)
        setLoading(false)
      }),
    [],
  )

  const signIn = async () => {
    const provider = new GoogleAuthProvider()
    try {
      await signInWithPopup(auth, provider)
    } catch (e) {
      // Popups can be blocked (notably in installed iOS PWAs); fall back to a redirect.
      const code = (e as { code?: string }).code
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider)
      } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        throw e
      }
    }
  }

  const signInTestUser = USE_EMULATORS
    ? async (email: string) => {
        // The Auth emulator accepts unsigned Google ID tokens.
        const token = JSON.stringify({ sub: email, email, email_verified: true, name: 'Testbruger' })
        await signInWithCredential(auth, GoogleAuthProvider.credential(token))
      }
    : undefined

  const value: AuthState = { user, loading, signIn, signInTestUser, signOut: () => fbSignOut(auth) }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
