import { useEffect, useEffectEvent, useRef, useState, type ActionDispatch, type CSSProperties, type PointerEvent } from 'react'
import { commentsOf, isReviewed, newId, type Action } from '../lib/review.ts'
import type { DeckCard, ReviewComment, ReviewState, Severity } from '../lib/types.ts'
import { CodeCard } from './CodeCard.tsx'
import { ProvisionalModal, ReviewDialog, type Draft } from './Dialogs.tsx'

interface Props {
  deck: DeckCard[]
  /** Current card; `deck.length` is the "all done" screen. */
  index: number
  setIndex: (index: number) => void
  review: ReviewState
  dispatch: ActionDispatch<[Action]>
  onFinish: () => void
  /** Another dialog is open: keyboard shortcuts must not act on the cards behind it. */
  paused: boolean
  /** Cards the file filter is hiding. */
  hiddenCount: number
}

/** Horizontal distance, in px, a drag must cover to count as a swipe. */
const SWIPE = 110
const EXIT_MS = 220

export function Deck({ deck, index, setIndex, review, dispatch, onFinish, paused, hiddenCount }: Props) {
  const card = deck[index] as DeckCard | undefined
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [exit, setExit] = useState<'left' | 'right' | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [prompting, setPrompting] = useState(false)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const timer = useRef(0)
  useEffect(() => () => clearTimeout(timer.current), [])

  const allDone = deck.every((c) => isReviewed(review, c.id))
  const busy = exit !== null || draft !== null || prompting
  const provisionalOpen = (c: DeckCard) => c.provisional !== null && !review.cards[c.id]?.provisional

  /** Flies the current card out, then moves on to the next card that still needs a look. */
  const leave = (dir: 'left' | 'right') => {
    const pending = (i: number) => i !== index && !isReviewed(review, deck[i].id)
    const ahead = deck.findIndex((_, i) => i > index && pending(i))
    const next = ahead >= 0 ? ahead : deck.findIndex((_, i) => pending(i))
    setDrag(null)
    setExit(dir)
    timer.current = window.setTimeout(() => {
      setExit(null)
      setIndex(next >= 0 ? next : deck.length)
    }, EXIT_MS)
  }

  const accept = () => {
    if (!card || busy) return
    if (provisionalOpen(card)) {
      setDrag(null)
      setPrompting(true)
      return
    }
    dispatch({ type: 'accept', card: card.id })
    leave('right')
  }

  const approveAnyway = () => {
    if (!card) return
    setPrompting(false)
    dispatch({ type: 'accept', card: card.id, dismissProvisional: true })
    leave('right')
  }

  const openReview = (lines: [number, number] | null = null) => {
    if (!card || exit || draft) return
    const existing = lines ? null : (commentsOf(review, card.id).find((c) => !c.lines) ?? null)
    setDrag(null)
    setPrompting(false)
    setDraft({ card, lines, existing, prefill: !existing && !lines && provisionalOpen(card) ? card.provisional : null })
  }

  const save = (severity: Severity, text: string) => {
    if (!draft) return
    const comment: ReviewComment = {
      id: draft.existing?.id ?? newId(),
      card: draft.card.id,
      severity,
      text,
      lines: draft.lines,
      createdAt: draft.existing?.createdAt ?? new Date().toISOString(),
    }
    dispatch({ type: 'saveComment', comment, adoptProvisional: draft.prefill !== null })
    setDraft(null)
    // A verdict on the whole card finishes it; a line comment leaves room for more.
    if (!draft.lines) leave('left')
  }

  const go = (delta: number) => {
    if (busy) return
    const last = allDone ? deck.length : deck.length - 1
    setIndex(Math.min(last, Math.max(0, index + delta)))
  }

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || draft || paused) return
    if (prompting) {
      // Opened from the banner after the comment was already handled: read-only.
      if (!card || !provisionalOpen(card)) setPrompting(false)
      else if (e.key === 'ArrowRight' || e.key === 'Enter') approveAnyway()
      else if (e.key === 'ArrowLeft') openReview()
      else if (e.key === 'Escape') setPrompting(false)
      else return
      e.preventDefault()
      return
    }
    if ((e.target as Element).closest?.('input, textarea, select')) return
    if (e.key === 'ArrowRight') accept()
    else if (e.key === 'ArrowLeft') openReview()
    else if (e.key === 'ArrowUp') go(-1)
    else if (e.key === 'ArrowDown') go(1)
    else return
    e.preventDefault()
  })
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (busy || e.button !== 0 || (e.target as Element).closest('[data-noswipe]')) return
    origin.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent) => {
    const o = origin.current
    if (o) setDrag({ x: e.clientX - o.x, y: e.clientY - o.y })
  }
  const onPointerUp = () => {
    if (!origin.current) return
    origin.current = null
    if (drag && drag.x > SWIPE) accept()
    else if (drag && drag.x < -SWIPE) openReview()
    else setDrag(null)
  }

  const topStyle = (attention: number): CSSProperties => {
    const pull = drag ? Math.max(-1, Math.min(1, drag.x / SWIPE)) : exit === 'right' ? 1 : exit === 'left' ? -1 : 0
    return {
      '--a': attention / 10,
      '--pull': pull,
      transform: exit
        ? `translate(${exit === 'right' ? 130 : -130}%, -4%) rotate(${exit === 'right' ? 14 : -14}deg)`
        : drag
          ? `translate(${drag.x}px, ${drag.y * 0.3}px) rotate(${drag.x / 28}deg)`
          : undefined,
      transition: drag ? 'none' : undefined,
      opacity: exit ? 0 : undefined,
    } as CSSProperties
  }

  return (
    <div className="deck-view">
      <div className="deck">
        {!card && deck.length === 0 && (
          <div className="done">
            <h2>No cards to show</h2>
            <p>The file filter hides all {hiddenCount} cards. Open "Files" above to bring some back.</p>
          </div>
        )}
        {!card && deck.length > 0 && (
          <div className="done">
            <div className="done-mark">✓</div>
            <h2>Everything is reviewed</h2>
            <p>
              {deck.length} cards, {review.comments.length} comment{review.comments.length === 1 ? '' : 's'}
              {hiddenCount > 0 && `, ${hiddenCount} more hidden by the file filter`}. Save your progress to keep it, or
              export the comments for the author.
            </p>
            <button type="button" className="btn primary" onClick={onFinish}>
              Export comments (.md)
            </button>
          </div>
        )}
        {[2, 1, 0].map((depth) => {
          const c = card && deck[index + depth]
          if (!c) return null
          const top = depth === 0
          return (
            <article
              key={c.id}
              className={`card depth-${depth}`}
              style={top ? topStyle(c.attention) : undefined}
              onPointerDown={top ? onPointerDown : undefined}
              onPointerMove={top ? onPointerMove : undefined}
              onPointerUp={top ? onPointerUp : undefined}
              onPointerCancel={top ? onPointerUp : undefined}
            >
              <CodeCard
                card={c}
                number={index + depth + 1}
                review={review}
                activeLines={top && draft ? draft.lines : null}
                onSelectLines={top && !busy ? openReview : undefined}
                onEditComment={(comment) => !busy && setDraft({ card: c, lines: comment.lines, existing: comment, prefill: null })}
                onUnaccept={() => dispatch({ type: 'unaccept', card: c.id })}
                onShowProvisional={() => !busy && setPrompting(true)}
              />
              {top && (
                <>
                  <span className="stamp stamp-accept">Accept</span>
                  <span className="stamp stamp-review">Review</span>
                </>
              )}
            </article>
          )
        })}
      </div>

      <div className="actions">
        <button type="button" className="round" onClick={() => go(-1)} disabled={index === 0} title="Previous card">
          ↑
        </button>
        <button type="button" className="round big review" onClick={() => openReview()} disabled={!card} title="Comment (left arrow)">
          ←<small>review</small>
        </button>
        <button type="button" className="round big accept" onClick={accept} disabled={!card} title="Accept (right arrow)">
          →<small>accept</small>
        </button>
        <button
          type="button"
          className="round"
          onClick={() => go(1)}
          disabled={index >= (allDone ? deck.length : deck.length - 1)}
          title="Next card"
        >
          ↓
        </button>
      </div>

      {draft && (
        <ReviewDialog
          key={draft.existing?.id ?? 'new'}
          draft={draft}
          onSave={save}
          onCancel={() => setDraft(null)}
          onDelete={() => {
            if (draft.existing) dispatch({ type: 'deleteComment', id: draft.existing.id })
            setDraft(null)
          }}
        />
      )}
      {prompting && card?.provisional && (
        <ProvisionalModal
          card={card}
          comment={card.provisional}
          resolved={!provisionalOpen(card)}
          onApprove={approveAnyway}
          onReview={() => openReview()}
          onCancel={() => setPrompting(false)}
        />
      )}
    </div>
  )
}
