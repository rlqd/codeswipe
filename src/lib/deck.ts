import type { DeckCard, DiffRow, ProvisionalComment } from './types.ts'

/**
 * Most rows a card shows. The card sizes its font so that exactly this many
 * rows fit its height, so nothing ever scrolls vertically. Part ids of split
 * cards depend on this number: changing it orphans saved progress.
 */
export const MAX_ROWS = 26

/** Context lines kept around the changes of a card, where the diff has them. */
const AUTO_CONTEXT = 3

export interface CardSpec {
  id: string
  title: string
  summary: string
  attention: number
  lines: [number, number]
  provisional: ProvisionalComment | null
}

const isBlank = (r: DiffRow) => r.type !== 'gap' && r.text.trim() === ''

/** How good it is to cut between two rows; higher is better. */
function breakScore(prev: DiffRow, next: DiffRow): number {
  if (prev.type === 'gap' || next.type === 'gap') return 4
  if (isBlank(prev)) return 3
  if (isBlank(next)) return 2.5
  if (/^\s{0,4}[}\])]+[;,]?\s*$/.test(prev.text)) return 2
  if (prev.type !== next.type && (prev.type === 'ctx' || next.type === 'ctx')) return 1
  return 0
}

function trimGaps(rows: DiffRow[]): DiffRow[] {
  let a = 0
  let b = rows.length
  while (a < b && rows[a].type === 'gap') a++
  while (b > a && rows[b - 1].type === 'gap') b--
  return rows.slice(a, b)
}

/** Cuts rows into chunks of at most MAX_ROWS, evenly sized, at natural breaks. */
export function splitRows(rows: DiffRow[]): DiffRow[][] {
  const out: DiffRow[][] = []
  let rest = rows
  while (rest.length > MAX_ROWS) {
    const n = Math.ceil(rest.length / MAX_ROWS)
    const ideal = Math.ceil(rest.length / n)
    const lo = Math.max(rest.length - (n - 1) * MAX_ROWS, ideal - 5, 1)
    const hi = Math.min(MAX_ROWS, ideal + 5)
    let best = ideal
    let bestScore = -Infinity
    for (let cut = lo; cut <= hi; cut++) {
      const score = breakScore(rest[cut - 1], rest[cut]) - Math.abs(cut - ideal) * 0.1
      if (score > bestScore) {
        bestScore = score
        best = cut
      }
    }
    out.push(rest.slice(0, best))
    rest = rest.slice(best)
  }
  out.push(rest)
  return out.map(trimGaps).filter((part) => part.length > 0)
}

/** Inserts a separator row wherever consecutive rows are not adjacent in the diff. */
function withGaps(rows: DiffRow[]): DiffRow[] {
  const out: DiffRow[] = []
  rows.forEach((row, i) => {
    const prev = rows[i - 1]
    if (prev && (prev.hunk !== row.hunk || prev.file !== row.file)) {
      const text = prev.file !== row.file ? row.file : ''
      out.push({ idx: 0, type: 'gap', oldNo: null, newNo: null, text, file: row.file, hunk: row.hunk })
    }
    out.push(row)
  })
  return out
}

const baseName = (path: string) => path.split('/').pop() ?? path

/**
 * Extends a card with the unchanged lines around it, so it does not open right
 * on the first changed line. Stays inside the hunk and inside MAX_ROWS, and
 * tops each end up to AUTO_CONTEXT lines counting the context already there.
 */
function padContext(part: DiffRow[], all: DiffRow[], pos: Map<number, number>): DiffRow[] {
  const isCtx = (r: DiffRow | undefined) => r?.type === 'ctx'
  const lead = part.findIndex((r) => !isCtx(r))
  if (lead < 0) return part
  const trail = part.length - 1 - part.findLastIndex((r) => !isCtx(r))
  const collect = (from: DiffRow, step: -1 | 1, want: number) => {
    const found: DiffRow[] = []
    let at = pos.get(from.idx)
    while (at !== undefined && found.length < want) {
      const next = all[(at += step)]
      if (!next || next.type !== 'ctx' || next.hunk !== from.hunk || next.file !== from.file) break
      found.push(next)
    }
    return found
  }
  const before = collect(part[0], -1, AUTO_CONTEXT - lead)
  const after = collect(part[part.length - 1], 1, AUTO_CONTEXT - trail)
  // Over the limit: give up lines from the longer side first.
  let room = MAX_ROWS - part.length
  let b = 0
  let a = 0
  while (room > 0 && (b < before.length || a < after.length)) {
    if (b < before.length && (b <= a || a >= after.length)) b++
    else a++
    room--
  }
  return [...before.slice(0, b).reverse(), ...part, ...after.slice(0, a)]
}

function makeCards(spec: CardSpec, rows: DiffRow[], auto: boolean, all: DiffRow[], pos: Map<number, number>): DeckCard[] {
  // Split first: part ids must not depend on the padding.
  const parts = splitRows(withGaps(rows)).map((part) => padContext(part, all, pos))
  return parts.map((part, i) => ({
    id: i === 0 ? spec.id : `${spec.id}#${i + 1}`,
    sourceId: spec.id,
    title: spec.title,
    summary: spec.summary,
    file: part.find((r) => r.type !== 'gap')?.file ?? '',
    attention: spec.attention,
    rows: part,
    part: i + 1,
    parts: parts.length,
    provisional: i === 0 ? spec.provisional : null,
    auto,
    weight: Math.max(1, part.filter((r) => r.type === 'add' || r.type === 'del').length),
  }))
}

/** Groups changes that no card claimed into cards of their own, hunk by hunk. */
function autoSpecs(rows: DiffRow[], taken: Set<number>): { spec: CardSpec; rows: DiffRow[] }[] {
  const out: { spec: CardSpec; rows: DiffRow[] }[] = []
  let run: DiffRow[] = []
  const flush = () => {
    const first = run.findIndex((r) => r.type !== 'ctx')
    if (first >= 0) {
      const last = run.findLastIndex((r) => r.type !== 'ctx')
      const kept = run.slice(Math.max(0, first - AUTO_CONTEXT), last + 1 + AUTO_CONTEXT)
      const label = lineLabel(kept)
      out.push({
        rows: kept,
        spec: {
          id: `auto-${kept[0].idx}`,
          title: `${baseName(kept[0].file)} ${label}`,
          summary: '',
          attention: 5,
          lines: [kept[0].idx, kept[kept.length - 1].idx],
          provisional: null,
        },
      })
    }
    run = []
  }
  for (const row of rows) {
    const prev = run[run.length - 1]
    if (taken.has(row.idx)) {
      flush()
      continue
    }
    if (prev && (prev.hunk !== row.hunk || prev.file !== row.file)) flush()
    run.push(row)
  }
  flush()
  return out
}

export function buildDeck(rows: DiffRow[], specs: CardSpec[]): { deck: DeckCard[]; warnings: string[] } {
  const warnings: string[] = []
  const deck: DeckCard[] = []
  const taken = new Set<number>()
  const pos = new Map(rows.map((r, i) => [r.idx, i]))
  const ids = new Set<string>()
  let skipped = 0
  for (const spec of specs) {
    const mine = rows.filter((r) => r.idx >= spec.lines[0] && r.idx <= spec.lines[1] && !taken.has(r.idx))
    if (!mine.length || ids.has(spec.id)) {
      skipped++
      continue
    }
    ids.add(spec.id)
    for (const r of mine) taken.add(r.idx)
    deck.push(...makeCards(spec, mine, false, rows, pos))
  }
  if (skipped) warnings.push(`${skipped} card(s) in the file pointed at no diff lines and were skipped.`)

  const autos = autoSpecs(rows, taken)
  for (const auto of autos) deck.push(...makeCards(auto.spec, auto.rows, true, rows, pos))
  if (autos.length && specs.length) {
    warnings.push(`${autos.length} change(s) were not assigned to a card. They are at the end of the deck as "unassigned".`)
  }
  return { deck, warnings }
}

/** Every file a card shows code from. */
export const cardFiles = (card: DeckCard): string[] => [
  ...new Set(card.rows.flatMap((r) => (r.type === 'gap' ? [] : [r.file]))),
]

/** The deck without the cards whose files are all unchecked in the file filter. */
export function visibleDeck(deck: DeckCard[], hiddenFiles: string[]): DeckCard[] {
  if (!hiddenFiles.length) return deck
  const hidden = new Set(hiddenFiles)
  return deck.filter((card) => !cardFiles(card).every((f) => hidden.has(f)))
}

/** "12-18" in new-file line numbers, or "old 5-7" when the rows are all deletions. */
export function lineLabel(rows: DiffRow[]): string {
  const span = (nums: number[]) => {
    const a = Math.min(...nums)
    const b = Math.max(...nums)
    return a === b ? `${a}` : `${a}-${b}`
  }
  const news = rows.flatMap((r) => (r.newNo === null ? [] : [r.newNo]))
  if (news.length) return span(news)
  const olds = rows.flatMap((r) => (r.oldNo === null ? [] : [r.oldNo]))
  return olds.length ? `old ${span(olds)}` : ''
}

/** The rows of a card a comment refers to: a diff line range, or all of them. */
export function rowsFor(card: DeckCard, lines: [number, number] | null): DiffRow[] {
  const real = card.rows.filter((r) => r.type !== 'gap')
  return lines ? real.filter((r) => r.idx >= lines[0] && r.idx <= lines[1]) : real
}
