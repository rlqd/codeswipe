import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { lineLabel, rowsFor } from '../lib/deck.ts'
import { SEVERITIES } from '../lib/types.ts'
import type { DeckCard, ProvisionalComment, ReviewComment, Severity } from '../lib/types.ts'

export function Modal({ onClose, onKeyDown, children }: { onClose: () => void; onKeyDown?: (e: KeyboardEvent) => void; children: ReactNode }) {
  return (
    <div className="overlay" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" onKeyDown={onKeyDown}>
        {children}
      </div>
    </div>
  )
}

export interface Draft {
  card: DeckCard
  lines: [number, number] | null
  existing: ReviewComment | null
  /** The agent's comment, offered as a starting point. */
  prefill: ProvisionalComment | null
}

interface ReviewDialogProps {
  draft: Draft
  onSave: (severity: Severity, text: string) => void
  onDelete: () => void
  onCancel: () => void
}

export function ReviewDialog({ draft, onSave, onDelete, onCancel }: ReviewDialogProps) {
  const start = draft.existing ?? draft.prefill
  const [severity, setSeverity] = useState<Severity>(start?.severity ?? 'comment')
  const [text, setText] = useState(start?.text ?? '')
  const area = useRef<HTMLTextAreaElement>(null)
  // A bare "reject" is a complete statement; the other two need words.
  const canSave = text.trim() !== '' || severity === 'reject'

  useEffect(() => {
    const el = area.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  const rows = rowsFor(draft.card, draft.lines)
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onCancel()
    else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSave) onSave(severity, text.trim())
  }

  return (
    <Modal onClose={onCancel} onKeyDown={onKeyDown}>
      <h3>{draft.existing ? 'Edit review' : 'Review'}</h3>
      <p className="modal-where">
        {draft.card.title}
        <code>
          {rows[0]?.file}:{lineLabel(rows)}
        </code>
        {draft.lines ? 'selected lines' : 'whole card'}
      </p>
      <div className="segmented" role="radiogroup" aria-label="Severity">
        {SEVERITIES.map((s) => (
          <button
            type="button"
            key={s}
            role="radio"
            aria-checked={severity === s}
            className={`sev-${s}${severity === s ? ' on' : ''}`}
            onClick={() => {
              setSeverity(s)
              area.current?.focus()
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <textarea
        ref={area}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={severity === 'question' ? 'What do you want to know?' : 'What should change, and why?'}
        rows={7}
      />
      {draft.prefill && <p className="modal-note">Pre-filled with the agent's provisional comment. Edit it freely.</p>}
      <div className="modal-actions">
        {draft.existing && (
          <button type="button" className="btn danger" onClick={onDelete}>
            Delete
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn primary" disabled={!canSave} onClick={() => onSave(severity, text.trim())}>
          Save <kbd>Ctrl ⏎</kbd>
        </button>
      </div>
    </Modal>
  )
}

interface ProvisionalModalProps {
  card: DeckCard
  comment: ProvisionalComment
  /** Already dismissed or adopted: show it for reading only. */
  resolved: boolean
  onApprove: () => void
  onReview: () => void
  onCancel: () => void
}

export function ProvisionalModal({ card, comment, resolved, onApprove, onReview, onCancel }: ProvisionalModalProps) {
  return (
    <Modal onClose={onCancel}>
      <h3>The agent flagged this card</h3>
      <p className="modal-where">{card.title}</p>
      <blockquote className={`quote sev-${comment.severity}`}>
        <b>{comment.severity}</b>
        {comment.text}
      </blockquote>
      {!resolved && <p className="modal-note">Reject this comment and approve the card anyway?</p>}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onCancel}>
          {resolved ? 'Close' : 'Cancel'} <kbd>Esc</kbd>
        </button>
        <span className="spacer" />
        {!resolved && (
          <>
            <button type="button" className="btn" onClick={onReview}>
              <kbd>←</kbd> Use as my comment
            </button>
            <button type="button" className="btn accept" onClick={onApprove}>
              Reject comment, approve <kbd>→</kbd>
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
