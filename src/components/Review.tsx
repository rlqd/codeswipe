import { useEffect, useReducer, useState } from 'react'
import type { Point } from '../lib/layout.ts'
import { autosave, download, exportMarkdown, serializeSession } from '../lib/metadata.ts'
import { cardStatus, isReviewed, progress, reducer } from '../lib/review.ts'
import type { Session } from '../lib/types.ts'
import { Deck } from './Deck.tsx'
import { Diagram } from './Diagram.tsx'

export function Review({ session, onClose }: { session: Session; onClose: () => void }) {
  const { deck } = session
  const [review, dispatch] = useReducer(reducer, session.review)
  const [view, setView] = useState<'cards' | 'diagram'>('cards')
  const [index, setIndex] = useState(() => {
    const first = deck.findIndex((c) => !isReviewed(session.review, c.id))
    return first < 0 ? deck.length : first
  })
  const [moved, setMoved] = useState<Record<string, Point>>({})
  const [warnings, setWarnings] = useState(session.warnings)

  useEffect(() => autosave(session, review), [session, review])
  // A file dropped mid-review must not replace the page.
  useEffect(() => {
    const block = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])

  const percent = Math.round(progress(deck, review) * 100)
  const reviewed = deck.filter((c) => isReviewed(review, c.id)).length
  const exportComments = () =>
    download(session.fileName.replace(/\.codeswipe\.json$/, '') + '.review.md', exportMarkdown(session, review), 'text/markdown')

  return (
    <div className="review">
      <header className="bar">
        <button type="button" className="logo" onClick={onClose} title="Back to start. Your progress is kept in this browser.">
          code<span>swipe</span>
        </button>
        <h1 title={session.description || undefined}>{session.title}</h1>
        <nav className="tabs">
          <button type="button" className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>
            Cards
          </button>
          <button type="button" className={view === 'diagram' ? 'on' : ''} onClick={() => setView('diagram')}>
            Diagram
          </button>
        </nav>
        <button type="button" className="btn" onClick={exportComments} disabled={!review.comments.length} title="Only your comments, as Markdown">
          Export comments
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => download(session.fileName, serializeSession(session, review), 'application/json')}
          title="The review file with your progress inside"
        >
          Download progress
        </button>
      </header>

      <div className="progress">
        <div className="progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${percent}%` }} />
        </div>
        <span className="progress-label">
          <b>{percent}%</b> reviewed, {reviewed}/{deck.length} cards
        </span>
        <div className="ticks">
          {deck.map((card, i) => (
            <button
              type="button"
              key={card.id}
              className={`st-${cardStatus(review, card.id)}${i === index ? ' current' : ''}`}
              style={{ flexGrow: card.weight }}
              title={`${i + 1}. ${card.title}`}
              onClick={() => {
                setIndex(i)
                setView('cards')
              }}
            />
          ))}
        </div>
      </div>

      {warnings.length > 0 && (
        <button type="button" className="notice" onClick={() => setWarnings([])} title="Dismiss">
          {warnings.join(' ')} <span>✕</span>
        </button>
      )}

      {view === 'cards' ? (
        <Deck deck={deck} index={index} setIndex={setIndex} review={review} dispatch={dispatch} onFinish={exportComments} />
      ) : (
        <Diagram
          deck={deck}
          edges={session.edges}
          review={review}
          currentId={deck[index]?.id}
          moved={moved}
          setMoved={setMoved}
          onOpen={(i) => {
            setIndex(i)
            setView('cards')
          }}
        />
      )}
    </div>
  )
}
