import { loadSession, readReview } from './metadata.ts'
import type { ReviewState, Session } from './types.ts'

const PREF = 'codeswipe:autosave-on'
const DB = 'codeswipe'
const STORE = 'progress'

interface SavedProgress {
  key: string
  fileName: string
  updatedAt: string
  review: ReviewState
}

export function autosaveEnabled(): boolean {
  try {
    return localStorage.getItem(PREF) === '1'
  } catch {
    return false
  }
}

export function setAutosaveEnabled(on: boolean): void {
  try {
    localStorage.setItem(PREF, on ? '1' : '0')
    // Left behind by the always-on autosave this replaced.
    localStorage.removeItem('codeswipe:autosave')
  } catch {
    // Storage may be unavailable; the toggle still works for this session.
  }
}

/**
 * Identifies a review file across visits: a hash of its name, its size in
 * bytes and its `createdAt` field.
 */
async function fileKey(fileName: string, text: string, createdAt: unknown): Promise<string> {
  const size = new Blob([text]).size
  const id = [fileName, size, typeof createdAt === 'string' ? createdAt : ''].join('\n')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

let db: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  db ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  // A failed open must not poison every later attempt.
  db.catch(() => (db = null))
  return db
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = (await openDb()).transaction(STORE, mode)
  return new Promise<T>((resolve, reject) => {
    const request = work(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(request.result)
    tx.onerror = tx.onabort = () => reject(tx.error ?? request.error)
  })
}

/** Rejects when the browser has no usable IndexedDB or the write fails. */
export async function saveProgress(session: Session, review: ReviewState): Promise<void> {
  if (!session.saveKey) throw new Error('This file could not be identified.')
  const record: SavedProgress = {
    key: session.saveKey,
    fileName: session.fileName,
    updatedAt: new Date().toISOString(),
    review,
  }
  await run('readwrite', (store) => store.put(record))
}

/** Removes the auto-saved progress of every file. */
export async function clearProgress(): Promise<void> {
  await run('readwrite', (store) => store.clear())
}

/**
 * Loads a dropped file and, when auto-save is on, puts back the progress
 * saved for it in this browser, unless the file itself carries newer progress.
 */
export async function openSession(text: string, fileName: string): Promise<Session> {
  const session = loadSession(text, fileName)
  try {
    session.saveKey = await fileKey(fileName, text, session.raw.createdAt)
    if (!autosaveEnabled()) return session
    const saved = await run<SavedProgress | undefined>('readonly', (store) => store.get(session.saveKey))
    const inFile = (session.raw.review as { updatedAt?: unknown } | undefined)?.updatedAt
    if (saved && !(typeof inFile === 'string' && inFile > saved.updatedAt)) {
      session.review = readReview(saved.review, session.deck)
      session.restored = true
    }
  } catch {
    // No crypto or IndexedDB here: the review still works, only without auto-save.
  }
  return session
}
