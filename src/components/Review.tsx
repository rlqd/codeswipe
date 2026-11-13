import { useEffect, useReducer, useState } from 'react'
import type { Point } from '../lib/layout.ts'
import { visibleDeck } from '../lib/deck.ts'
import { download, exportMarkdown, serializeSession } from '../lib/metadata.ts'
import { cardStatus, isReviewed, progress, reducer } from '../lib/review.ts'
import { autosaveEnabled, clearProgress, saveProgress, setAutosaveEnabled } from '../lib/storage.ts'
import type { Session } from '../lib/types.ts'
import { Deck } from './Deck.tsx'
import { Diagram } from './Diagram.tsx'
import { FileFilter } from './FileFilter.tsx'
import { SaveDialog } from './SaveDialog.tsx'

export function Review({ session, onClose }: { session: Session; onClose: () => void }) {
  const [review, dispatch] = useReducer(reducer, session.review)
  // Everything below works on the cards the file filter lets through.
  const deck = visibleDeck(session.deck, review.hiddenFiles)
  const hiddenCount = session.deck.length - deck.length
  const shownIds = new Set(deck.map((c) => c.id))
  const edges = hiddenCount ? session.edges.filter((e) => shownIds.has(e.from) && shownIds.has(e.to)) : session.edges
  const [view, setView] = useState<'cards' | 'diagram'>('cards')
  const [index, setIndex] = useState(() => {
    const first = deck.findIndex((c) => !isReviewed(session.review, c.id))
    return first < 0 ? deck.length : first
  })
  const [dialog, setDialog] = useState<'files' | 'save' | null>(null)
  const [autoSave, setAutoSave] = useState(autosaveEnabled)
  const [saveFailed, setSaveFailed] = useState(false)
  const [toast, setToast] = useState(session.restored)
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(false), 5000)
    return () => clearTimeout(timer)
  }, [toast])
  /** The progress as last downloaded, to know whether leaving would lose anything. */
  const [downloaded, setDownloaded] = useState(session.review)
  const [moved, setMoved] = useState<Record<string, Point>>({})
  const [warnings, setWarnings] = useState(session.warnings)
  const [wrap, setWrap] = useState(() => {
    try {
      return localStorage.getItem('codeswipe:wrap') === '1'
    } catch {
      return false
    }
  })
  const toggleWrap = (on: boolean) => {
    setWrap(on)
    try {
      localStorage.setItem('codeswipe:wrap', on ? '1' : '0')
    } catch {
      // Storage may be unavailable; the toggle still works for this session.
    }
  }

  useEffect(() => {
    if (!autoSave) return
    let current = true
    saveProgress(session, review).then(
      () => current && setSaveFailed(false),
      () => current && setSaveFailed(true),
    )
    return () => {
      current = false
    }
  }, [autoSave, session, review])
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
  const setHiddenFiles = (files: string[]) => {
    // Stay on the current card if it survives, else go to the next one that needs a look.
    const next = visibleDeck(session.deck, files)
    const currentId = deck[index]?.id
    let at = next.findIndex((c) => c.id === currentId)
    if (at < 0) at = next.findIndex((c) => !isReviewed(review, c.id))
    dispatch({ type: 'setHiddenFiles', files })
    setIndex(at < 0 ? next.length : at)
  }
  const downloadProgress = () => {
    download(session.fileName, serializeSession(session, review), 'application/json')
    setDownloaded(review)
  }
  const close = () => {
    const kept = (autoSave && !saveFailed) || review === downloaded
    if (kept || window.confirm('Leave this review? Progress you have not saved will be lost.')) onClose()
  }
  const exportComments = () =>
    download(session.fileName.replace(/\.codeswipe\.json$/, '') + '.review.md', exportMarkdown(session, review), 'text/markdown')

  return (
    <div className={`review${wrap ? ' wrap-code' : ''}`}>
      <header className="bar">
        <button type="button" className="logo" onClick={close} title="Back to start">
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
        <label className="wrap-toggle" title="Wrap long code lines and scroll vertically">
          <input type="checkbox" checked={wrap} onChange={(e) => toggleWrap(e.target.checked)} />
          Wrap lines
        </label>
        <button type="button" className="btn" onClick={exportComments} disabled={!review.comments.length} title="Only your comments, as Markdown">
          Export comments
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => setDialog('save')}
          title={autoSave && !saveFailed ? 'Auto-saving in this browser' : 'Download the file or turn on auto-save'}
        >
          Save progress
        </button>
      </header>

      <div className="progress">
        <div className="progress-track" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${percent}%` }} />
        </div>
        <span className="progress-label">
          <b>{percent}%</b> reviewed, {reviewed}/{deck.length} cards
        </span>
        <button
          type="button"
          className={`btn filter-btn${hiddenCount ? ' on' : ''}`}
          onClick={() => setDialog('files')}
          title="Choose which files and folders to review"
        >
          Files{hiddenCount > 0 && <small>{hiddenCount} cards hidden</small>}
        </button>
        <div className="ticks">
          {deck.map((card, i) => (
            <button
              type="button"
              key={card.id}
              className={`st-${cardStatus(review, card.id)}${
                card.provisional && !isReviewed(review, card.id) ? ' tick-prov' : ''
              }${i === index ? ' current' : ''}`}
              title={`${i + 1}. ${card.title}`}
              onClick={() => {
                setIndex(i)
                setView('cards')
              }}
            />
          ))}
          {toast && (
            <div className="toast" role="status">
              Restored your auto-saved progress for this file.
            </div>
          )}
        </div>
      </div>

      {warnings.length > 0 && (
        <button type="button" className="notice" onClick={() => setWarnings([])} title="Dismiss">
          {warnings.join(' ')} <span>✕</span>
        </button>
      )}

      {view === 'cards' ? (
        <Deck
          deck={deck}
          index={index}
          setIndex={setIndex}
          review={review}
          dispatch={dispatch}
          onFinish={exportComments}
          paused={dialog !== null}
          hiddenCount={hiddenCount}
        />
      ) : (
        <Diagram
          deck={deck}
          key={review.hiddenFiles.join('\n')}
          edges={edges}
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

      {dialog === 'files' && (
        <FileFilter deck={session.deck} hidden={review.hiddenFiles} onChange={setHiddenFiles} onClose={() => setDialog(null)} />
      )}
      {dialog === 'save' && (
        <SaveDialog
          autoSave={autoSave}
          failed={saveFailed}
          onToggle={(on) => {
            setAutoSave(on)
            setAutosaveEnabled(on)
          }}
          onDownload={downloadProgress}
          onClear={clearProgress}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
