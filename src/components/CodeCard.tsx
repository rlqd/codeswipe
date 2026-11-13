import { useState, type CSSProperties, type PointerEvent } from 'react'
import { MAX_ROWS, lineLabel, rowsFor } from '../lib/deck.ts'
import { highlight } from '../lib/highlight.ts'
import { commentsOf } from '../lib/review.ts'
import type { DeckCard, ReviewComment, ReviewState } from '../lib/types.ts'

interface Props {
  card: DeckCard
  number: number
  review: ReviewState
  /** Diff line range the open dialog refers to, highlighted on the card. */
  activeLines?: [number, number] | null
  onSelectLines?: (lines: [number, number]) => void
  onEditComment?: (comment: ReviewComment) => void
  onUnaccept?: () => void
  onShowProvisional?: () => void
}

const SIGN = { add: '+', del: '-', ctx: ' ', gap: '' }

export function CodeCard({ card, number, review, activeLines, onSelectLines, onEditComment, onUnaccept, onShowProvisional }: Props) {
  // Row indices being dragged over in the line-number gutter.
  const [sel, setSel] = useState<{ from: number; to: number } | null>(null)
  const comments = commentsOf(review, card.id)
  const state = review.cards[card.id]
  const lineComments = comments.filter((c) => c.lines)

  const rowAt = (e: PointerEvent) => {
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-row]')
    return el && e.currentTarget.contains(el) ? Number(el.dataset.row) : null
  }
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!onSelectLines || e.button !== 0 || !(e.target as Element).closest('.gutter')) return
    const row = rowAt(e)
    if (row === null) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setSel({ from: row, to: row })
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!sel) return
    const row = rowAt(e)
    if (row !== null && row !== sel.to) setSel({ ...sel, to: row })
  }
  const onUp = () => {
    if (!sel) return
    const picked = card.rows
      .slice(Math.min(sel.from, sel.to), Math.max(sel.from, sel.to) + 1)
      .filter((r) => r.type !== 'gap')
    setSel(null)
    if (picked.length) onSelectLines?.([picked[0].idx, picked[picked.length - 1].idx])
  }

  const isSelected = (i: number, idx: number) =>
    sel
      ? i >= Math.min(sel.from, sel.to) && i <= Math.max(sel.from, sel.to)
      : Boolean(activeLines && idx >= activeLines[0] && idx <= activeLines[1])

  return (
    <>
      <header className="card-head">
        <span className="card-num">{number}</span>
        <div className="card-titles">
          <h2>
            {card.title}
            {card.parts > 1 && (
              <span className="card-part">
                part {card.part}/{card.parts}
              </span>
            )}
            {card.auto && <span className="card-part">unassigned</span>}
          </h2>
          <p className="card-file">
            {card.file}
            <span>:{lineLabel(card.rows)}</span>
          </p>
        </div>
        {card.attention > 0 && (
          <span className="attention" title={`Attention ${card.attention} of 10`}>
            <i />
            {card.attention}
          </span>
        )}
      </header>

      {card.summary && card.part === 1 && <p className="card-summary">{card.summary}</p>}

      {card.provisional && (
        <button
          type="button"
          data-noswipe
          className={`provisional sev-${card.provisional.severity} ${state?.provisional ?? ''}`}
          onClick={onShowProvisional}
        >
          <b>
            Agent {card.provisional.severity}
            {state?.provisional && ` (${state.provisional})`}
          </b>
          <span>{card.provisional.text}</span>
        </button>
      )}

      <div
        className="code"
        style={{ '--rows': MAX_ROWS } as CSSProperties}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setSel(null)}
      >
        <div className="code-inner">
          {card.rows.map((row, i) => {
            if (row.type === 'gap') {
              return (
                <div key={i} className="row gap">
                  <span className="gutter" />
                  <span className="src">⋯ {row.text}</span>
                </div>
              )
            }
            const mark = lineComments.find((c) => row.idx >= c.lines![0] && row.idx <= c.lines![1])
            return (
              <div
                key={i}
                data-row={i}
                className={`row ${row.type}${isSelected(i, row.idx) ? ' sel' : ''}${mark ? ` mark sev-${mark.severity}` : ''}`}
              >
                <span className="gutter" data-noswipe>
                  <span>{row.oldNo}</span>
                  <span>{row.newNo}</span>
                </span>
                <span className="sign">{SIGN[row.type]}</span>
                <span className="src">
                  {highlight(row.text, row.file).map((t, k) =>
                    t.cls ? (
                      <span key={k} className={t.cls}>
                        {t.text}
                      </span>
                    ) : (
                      t.text
                    ),
                  )}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <footer className="card-foot">
        {state?.accepted && (
          <button type="button" data-noswipe className="chip sev-accepted" onClick={onUnaccept} title="Undo accept">
            ✓ accepted <span className="chip-x">✕</span>
          </button>
        )}
        {comments.map((c) => (
          <button
            type="button"
            data-noswipe
            key={c.id}
            className={`chip sev-${c.severity}`}
            title={c.text}
            onClick={() => onEditComment?.(c)}
          >
            {c.severity}
            <span className="chip-where">{c.lines ? `L${lineLabel(rowsFor(card, c.lines))}` : 'whole card'}</span>
          </button>
        ))}
        {!state?.accepted && comments.length === 0 && (
          <span className="card-hint">Swipe right to accept, left to comment. Tap or drag line numbers to comment on lines.</span>
        )}
      </footer>
    </>
  )
}
