import { buildDeck, cardFiles, lineLabel, rowsFor, type CardSpec } from './deck.ts'
import { normalizeEol, parseDiff } from './diff.ts'
import { emptyReview, newId } from './review.ts'
import { SEVERITIES } from './types.ts'
import type { DeckCard, Edge, ProvisionalComment, ReviewState, Session, Severity } from './types.ts'

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const isSeverity = (v: unknown): v is Severity => SEVERITIES.includes(v as Severity)
const isRange = (v: unknown): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && Number.isInteger(v[0]) && Number.isInteger(v[1]) && v[0] <= v[1]

function readProvisional(v: unknown): ProvisionalComment | null {
  const text = typeof v === 'string' ? v : isObject(v) && typeof v.text === 'string' ? v.text : ''
  if (!text.trim()) return null
  return { text: text.trim(), severity: isObject(v) && isSeverity(v.severity) ? v.severity : 'comment' }
}

function readCards(v: unknown): CardSpec[] {
  if (!Array.isArray(v)) return []
  return v.flatMap((c): CardSpec[] => {
    if (!isObject(c) || typeof c.id !== 'string' || !c.id || !isRange(c.lines)) return []
    return [
      {
        id: c.id,
        title: typeof c.title === 'string' && c.title.trim() ? c.title.trim() : c.id,
        summary: typeof c.summary === 'string' ? c.summary.trim() : '',
        attention: Math.min(10, Math.max(0, Number(c.attention) || 0)),
        lines: c.lines,
        provisional: readProvisional(c.provisionalComment),
      },
    ]
  })
}

/** Reads saved progress, dropping whatever does not match this deck. */
export function readReview(v: unknown, deck: DeckCard[]): ReviewState {
  const review = emptyReview()
  if (!isObject(v)) return review
  const cardIds = new Set(deck.map((c) => c.id))
  if (Array.isArray(v.hiddenFiles)) {
    const files = new Set(deck.flatMap(cardFiles))
    review.hiddenFiles = v.hiddenFiles.filter((f): f is string => typeof f === 'string' && files.has(f))
  }
  if (isObject(v.cards)) {
    for (const [id, c] of Object.entries(v.cards)) {
      if (!cardIds.has(id) || !isObject(c)) continue
      review.cards[id] = {
        ...(c.accepted === true ? { accepted: true } : {}),
        ...(c.provisional === 'dismissed' || c.provisional === 'adopted' ? { provisional: c.provisional } : {}),
      }
    }
  }
  if (Array.isArray(v.comments)) {
    for (const c of v.comments) {
      if (!isObject(c) || typeof c.card !== 'string' || !cardIds.has(c.card) || !isSeverity(c.severity)) continue
      review.comments.push({
        id: typeof c.id === 'string' ? c.id : newId(),
        card: c.card,
        severity: c.severity,
        text: typeof c.text === 'string' ? c.text : '',
        lines: isRange(c.lines) ? c.lines : null,
        createdAt: typeof c.createdAt === 'string' ? c.createdAt : new Date().toISOString(),
      })
    }
  }
  return review
}

const looksLikeDiff = (text: string) => /^(diff --git |--- |Index: )/m.test(text) && /^@@ -\d/m.test(text)

/** Turns a dropped file into a review session. Throws with a readable message. */
export function loadSession(text: string, fileName: string): Session {
  let raw: Json
  const trimmed = text.replace(/^﻿/, '').trimStart()
  if (trimmed.startsWith('{')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new Error('This file is not valid JSON.')
    }
    if (!isObject(parsed) || typeof parsed.diff !== 'string') {
      throw new Error('This is not a codeswipe file: it has no "diff".')
    }
    raw = parsed
  } else if (looksLikeDiff(trimmed)) {
    // A plain diff still works, just without the agent's guidance.
    raw = {
      format: 'codeswipe',
      version: 1,
      title: fileName.replace(/\.(diff|patch|txt)$/i, ''),
      diff: normalizeEol(trimmed),
      cards: [],
      relations: [],
    }
  } else {
    throw new Error('Drop a .codeswipe.json file prepared by your agent, or a plain .diff.')
  }

  const rows = parseDiff(raw.diff as string)
  if (!rows.length) throw new Error('The diff in this file has no changes to review.')
  const { deck, warnings } = buildDeck(rows, readCards(raw.cards))

  // Relations are between metadata cards; a split card is represented by its
  // first part, and its parts are chained so they stay together on the diagram.
  const ids = new Set(deck.map((c) => c.id))
  const edges: Edge[] = []
  for (const r of Array.isArray(raw.relations) ? raw.relations : []) {
    if (!isObject(r) || typeof r.from !== 'string' || typeof r.to !== 'string') continue
    if (r.from === r.to || !ids.has(r.from) || !ids.has(r.to)) continue
    edges.push({ from: r.from, to: r.to, kind: typeof r.kind === 'string' ? r.kind : '' })
  }
  deck.forEach((card, i) => {
    if (card.part > 1) edges.push({ from: deck[i - 1].id, to: card.id, kind: 'continues' })
  })

  return {
    key: newId(),
    saveKey: '',
    fileName: fileName.replace(/(\.codeswipe)?\.[^.]+$/, '') + '.codeswipe.json',
    raw,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Code review',
    description: typeof raw.description === 'string' ? raw.description : '',
    deck,
    edges,
    review: readReview(raw.review, deck),
    warnings,
    restored: false,
  }
}

/** The metadata file again, with the reviewer's progress inside. */
export function serializeSession(session: Session, review: ReviewState): string {
  return JSON.stringify({ ...session.raw, review: { updatedAt: new Date().toISOString(), ...review } }, null, 2)
}

export function exportMarkdown(session: Session, review: ReviewState): string {
  const order = new Map(session.deck.map((c, i) => [c.id, i]))
  const comments = [...review.comments].sort(
    (a, b) => order.get(a.card)! - order.get(b.card)! || (a.lines?.[0] ?? 0) - (b.lines?.[0] ?? 0),
  )
  const out = [`# Review comments: ${session.title}`, '']
  if (!comments.length) out.push('No comments.', '')
  for (const c of comments) {
    const card = session.deck[order.get(c.card)!]
    const rows = rowsFor(card, c.lines)
    out.push(`**${c.severity.toUpperCase()}** \`${rows[0]?.file ?? card.file}:${lineLabel(rows)}\` (${card.title})`, '')
    out.push(...(c.text.trim() || '(no text)').split('\n').map((line) => `> ${line}`.trimEnd()), '')
  }
  return out.join('\n')
}

export function download(name: string, content: BlobPart, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
