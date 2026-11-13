import { useState } from 'react'
import { Home } from './components/Home.tsx'
import { Review } from './components/Review.tsx'
import { loadSession } from './lib/metadata.ts'
import type { Session } from './lib/types.ts'
import './App.css'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = (text: string, fileName: string) => {
    try {
      setSession(loadSession(text, fileName))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this file.')
    }
  }

  return session ? (
    <Review key={session.key} session={session} onClose={() => setSession(null)} />
  ) : (
    <Home error={error} onLoad={load} />
  )
}
