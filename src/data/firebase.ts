import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'

const env = import.meta.env
export const USE_EMULATORS = env.VITE_USE_EMULATORS === 'true'

/**
 * Config comes from VITE_FIREBASE_* env vars. In emulator mode a demo project ID is forced so
 * that local dev and e2e tests can never touch the real project, even if real env vars are set.
 */
const firebaseConfig = USE_EMULATORS
  ? {
      apiKey: env.VITE_FIREBASE_API_KEY || 'demo-api-key',
      authDomain: 'demo-avensis.firebaseapp.com',
      projectId: env.VITE_EMULATOR_PROJECT_ID || 'demo-avensis',
      appId: env.VITE_FIREBASE_APP_ID || 'demo-app-id',
    }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    }

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// Offline persistence: reads come from IndexedDB when offline and writes are queued until
// the connection is back. Works across multiple open tabs.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
})

if (USE_EMULATORS) {
  const host = env.VITE_EMULATOR_HOST || '127.0.0.1'
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true })
  connectFirestoreEmulator(db, host, 8080)
}
