/**
 * Firestore access for users/{uid}/trips, users/{uid}/events and users/{uid}/settings/app.
 * Converts Firestore Timestamps to epoch ms for the domain model.
 *
 * Writes are fire-and-forget: Firestore applies them to the local cache immediately and
 * queues them for the server, so logging works offline. The returned promise only settles
 * once the server has acknowledged, so callers must not await it to update the UI.
 */
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { withDefaults } from '../lib/defaults'
import type { CarEvent, Settings, Trip } from '../lib/types'
import { db } from './firebase'

const tripsCol = (uid: string) => collection(db, 'users', uid, 'trips')
const eventsCol = (uid: string) => collection(db, 'users', uid, 'events')
const settingsDoc = (uid: string) => doc(db, 'users', uid, 'settings', 'app')

const toMs = (v: unknown): number => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' ? v : Date.now())

function toTrip(s: QueryDocumentSnapshot<DocumentData>): Trip {
  const d = s.data()
  return {
    id: s.id,
    timestamp: toMs(d.timestamp),
    rating: d.rating,
    severity: d.severity ?? null,
    situations: d.situations ?? [],
    engine: d.engine,
    tripType: d.tripType,
    odometer: d.odometer ?? null,
    notes: d.notes ?? '',
    location: d.location ?? null,
    weatherStatus: d.weatherStatus ?? 'pending',
    weather: d.weather ?? null,
  }
}

function toEvent(s: QueryDocumentSnapshot<DocumentData>): CarEvent {
  const d = s.data()
  return {
    id: s.id,
    timestamp: toMs(d.timestamp),
    type: d.type,
    odometer: d.odometer ?? null,
    liters: d.liters ?? null,
    fuelBrand: d.fuelBrand ?? '',
    octane: d.octane ?? null,
    notes: d.notes ?? '',
  }
}

type Unsub = () => void
const logError = (what: string) => (e: unknown) => console.error(`Firestore ${what} failed`, e)

export function subscribeTrips(uid: string, cb: (trips: Trip[]) => void, onError: (e: Error) => void): Unsub {
  return onSnapshot(query(tripsCol(uid), orderBy('timestamp', 'desc')), (snap) => cb(snap.docs.map(toTrip)), onError)
}

export function subscribeEvents(uid: string, cb: (events: CarEvent[]) => void, onError: (e: Error) => void): Unsub {
  return onSnapshot(query(eventsCol(uid), orderBy('timestamp', 'desc')), (snap) => cb(snap.docs.map(toEvent)), onError)
}

export function subscribeSettings(uid: string, cb: (s: Settings) => void, onError: (e: Error) => void): Unsub {
  return onSnapshot(settingsDoc(uid), (snap) => cb(withDefaults(snap.exists() ? (snap.data() as Partial<Settings>) : null)), onError)
}

export type TripInput = Omit<Trip, 'id'>
export type EventInput = Omit<CarEvent, 'id'>

function tripData(t: Partial<TripInput>): DocumentData {
  const { timestamp, ...rest } = t
  return { ...rest, ...(timestamp != null ? { timestamp: Timestamp.fromMillis(timestamp) } : {}) }
}

/** Create a trip; returns its id synchronously. */
export function addTrip(uid: string, trip: TripInput): string {
  const ref = doc(tripsCol(uid))
  setDoc(ref, { ...tripData(trip), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(logError('addTrip'))
  return ref.id
}

export function updateTrip(uid: string, id: string, patch: Partial<TripInput>): void {
  updateDoc(doc(tripsCol(uid), id), { ...tripData(patch), updatedAt: serverTimestamp() }).catch(logError('updateTrip'))
}

export function deleteTrip(uid: string, id: string): void {
  deleteDoc(doc(tripsCol(uid), id)).catch(logError('deleteTrip'))
}

function eventData(e: Partial<EventInput>): DocumentData {
  const { timestamp, ...rest } = e
  return { ...rest, ...(timestamp != null ? { timestamp: Timestamp.fromMillis(timestamp) } : {}) }
}

export function addEvent(uid: string, event: EventInput): string {
  const ref = doc(eventsCol(uid))
  setDoc(ref, { ...eventData(event), createdAt: serverTimestamp(), updatedAt: serverTimestamp() }).catch(logError('addEvent'))
  return ref.id
}

export function updateEvent(uid: string, id: string, patch: Partial<EventInput>): void {
  updateDoc(doc(eventsCol(uid), id), { ...eventData(patch), updatedAt: serverTimestamp() }).catch(logError('updateEvent'))
}

export function deleteEvent(uid: string, id: string): void {
  deleteDoc(doc(eventsCol(uid), id)).catch(logError('deleteEvent'))
}

export function saveSettings(uid: string, settings: Settings): void {
  setDoc(settingsDoc(uid), { ...settings, updatedAt: serverTimestamp() }).catch(logError('saveSettings'))
}
