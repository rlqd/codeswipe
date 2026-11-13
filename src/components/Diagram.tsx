import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { lineLabel } from '../lib/deck.ts'
import { NODE_H, NODE_W, layoutGraph, type Point } from '../lib/layout.ts'
import { cardStatus } from '../lib/review.ts'
import type { DeckCard, Edge, ReviewState } from '../lib/types.ts'

interface Props {
  deck: DeckCard[]
  edges: Edge[]
  review: ReviewState
  currentId: string | undefined
  /** Positions of nodes the reviewer dragged; kept by the parent across view switches. */
  moved: Record<string, Point>
  setMoved: (moved: Record<string, Point>) => void
  onOpen: (index: number) => void
}

interface View {
  x: number
  y: number
  k: number
}

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; view: View }
  | { kind: 'node'; id: string; sx: number; sy: number; at: Point; dragged: boolean }

function edgePath(a: Point, b: Point) {
  const ax = a.x + NODE_W / 2
  const ay = a.y + NODE_H / 2
  const bx = b.x + NODE_W / 2
  const by = b.y + NODE_H / 2
  if (Math.abs(bx - ax) >= NODE_W * 0.75) {
    const s = Math.sign(bx - ax)
    const x1 = ax + (s * NODE_W) / 2
    const x2 = bx - (s * NODE_W) / 2
    const c = Math.max(36, Math.abs(x2 - x1) / 2)
    return { d: `M${x1},${ay} C${x1 + s * c},${ay} ${x2 - s * c},${by} ${x2},${by}`, mx: (x1 + x2) / 2, my: (ay + by) / 2 }
  }
  const s = Math.sign(by - ay) || 1
  const y1 = ay + (s * NODE_H) / 2
  const y2 = by - (s * NODE_H) / 2
  const c = Math.max(28, Math.abs(y2 - y1) / 2)
  return { d: `M${ax},${y1} C${ax},${y1 + s * c} ${bx},${y2 - s * c} ${bx},${y2}`, mx: (ax + bx) / 2, my: (y1 + y2) / 2 }
}

export function Diagram({ deck, edges, review, currentId, moved, setMoved, onOpen }: Props) {
  const layout = layoutGraph(
    deck.map((c) => c.id),
    edges,
  )
  const pos = { ...layout.pos, ...moved }
  const frame = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 })
  const [hover, setHover] = useState<string | null>(null)

  const fit = () => {
    const el = frame.current
    const points = Object.values(pos)
    if (!el || !points.length) return
    const x0 = Math.min(...points.map((p) => p.x))
    const y0 = Math.min(...points.map((p) => p.y)) - 30
    const w = Math.max(...points.map((p) => p.x)) + NODE_W - x0
    const h = Math.max(...points.map((p) => p.y)) + NODE_H - y0
    const k = Math.min(1.15, (el.clientWidth - 80) / w, (el.clientHeight - 80) / h)
    setView({ k, x: (el.clientWidth - w * k) / 2 - x0 * k, y: (el.clientHeight - h * k) / 2 - y0 * k })
  }
  // Frame the whole graph once, when the screen opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(fit, [])

  const zoom = (factor: number, cx: number, cy: number) =>
    setView((v) => {
      const k = Math.min(2.5, Math.max(0.2, v.k * factor))
      return { k, x: cx - ((cx - v.x) * k) / v.k, y: cy - ((cy - v.y) * k) / v.k }
    })

  // React registers wheel listeners as passive, which cannot stop the page from scrolling.
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const box = el.getBoundingClientRect()
      zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - box.left, e.clientY - box.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('.diagram-tools')) return
    const id = (e.target as Element).closest<HTMLElement>('[data-node]')?.dataset.node
    gesture.current = id
      ? { kind: 'node', id, sx: e.clientX, sy: e.clientY, at: pos[id], dragged: false }
      : { kind: 'pan', sx: e.clientX, sy: e.clientY, view }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent) => {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.sx
    const dy = e.clientY - g.sy
    if (g.kind === 'pan') return setView({ ...g.view, x: g.view.x + dx, y: g.view.y + dy })
    if (!g.dragged && Math.hypot(dx, dy) < 4) return
    g.dragged = true
    setMoved({ ...moved, [g.id]: { x: g.at.x + dx / view.k, y: g.at.y + dy / view.k } })
  }
  const onPointerUp = () => {
    const g = gesture.current
    gesture.current = null
    if (g?.kind === 'node' && !g.dragged) onOpen(deck.findIndex((c) => c.id === g.id))
  }

  const center = () => {
    const el = frame.current
    return el ? ([el.clientWidth / 2, el.clientHeight / 2] as const) : ([0, 0] as const)
  }

  return (
    <div
      className="diagram"
      ref={frame}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (gesture.current = null)}
    >
      <div className="world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg className="edges" width="1" height="1">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,1 L9,5 L0,9 z" />
            </marker>
            <marker id="arrow-lit" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,1 L9,5 L0,9 z" />
            </marker>
          </defs>
          {edges.map((e) => {
            const p = edgePath(pos[e.from], pos[e.to])
            const lit = hover === e.from || hover === e.to
            const chain = e.kind === 'continues'
            return (
              <g key={`${e.from}>${e.to}`} className={`edge${lit ? ' lit' : ''}${chain ? ' chain' : ''}`}>
                <path d={p.d} markerEnd={chain ? undefined : `url(#${lit ? 'arrow-lit' : 'arrow'})`} />
                {e.kind && !chain && (
                  <text x={p.mx} y={p.my - 5} textAnchor="middle">
                    {e.kind}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {layout.standalone && edges.length > 0 && (
          <div className="group-label" style={{ left: layout.standalone.x, top: layout.standalone.y - 30 }}>
            Standalone
          </div>
        )}

        {deck.map((card, i) => (
          <div
            key={card.id}
            data-node={card.id}
            className={`node st-${cardStatus(review, card.id)}${card.id === currentId ? ' current' : ''}`}
            style={{ left: pos[card.id].x, top: pos[card.id].y, width: NODE_W, height: NODE_H, '--a': card.attention / 10 } as CSSProperties}
            title={[card.summary, card.provisional && `Agent: ${card.provisional.text}`].filter(Boolean).join('\n\n') || undefined}
            onPointerEnter={() => setHover(card.id)}
            onPointerLeave={() => setHover(null)}
          >
            <span className="node-num">{i + 1}</span>
            <span className="node-title">
              {card.title}
              {card.parts > 1 && ` (${card.part}/${card.parts})`}
            </span>
            <span className="node-file">
              {card.file.split('/').pop()}:{lineLabel(card.rows)}
            </span>
            {card.attention >= 6 && <i className="node-flag" title={`Attention ${card.attention} of 10`} />}
          </div>
        ))}
      </div>

      <div className="diagram-tools">
        <button type="button" onClick={() => zoom(1.25, ...center())} title="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoom(0.8, ...center())} title="Zoom out">
          −
        </button>
        <button type="button" onClick={fit} title="Fit to screen">
          Fit
        </button>
      </div>
      <div className="legend">
        <span className="st-none">unreviewed</span>
        <span className="st-accepted">accepted</span>
        <span className="st-reject">reject</span>
        <span className="st-comment">comment</span>
        <span className="st-question">question</span>
        <em>Arrows point at what a card depends on. Click a node to open its card.</em>
      </div>
    </div>
  )
}
