export type Severity = 'reject' | 'comment' | 'question'
export const SEVERITIES: Severity[] = ['reject', 'comment', 'question']

/** What a card looks like on the diagram and the progress strip. */
export type Status = 'none' | 'accepted' | Severity

export interface DiffRow {
  /** 1-based line number inside the diff text; 0 for gap rows. */
  idx: number
  type: 'ctx' | 'add' | 'del' | 'gap'
  oldNo: number | null
  newNo: number | null
  text: string
  file: string
  hunk: number
}

export interface ProvisionalComment {
  severity: Severity
  text: string
}

/** One card of the deck. A long metadata card becomes several of these. */
export interface DeckCard {
  /** Metadata id, or `id#2` for the second part of a split card. */
  id: string
  sourceId: string
  title: string
  summary: string
  file: string
  attention: number
  rows: DiffRow[]
  part: number
  parts: number
  provisional: ProvisionalComment | null
  /** Created by the app for changes the metadata did not assign to a card. */
  auto: boolean
  /** Changed lines, used to weight progress. */
  weight: number
}

export interface Edge {
  from: string
  to: string
  kind: string
}

export interface ReviewComment {
  id: string
  card: string
  severity: Severity
  text: string
  /** Diff line range the comment is attached to, or null for the whole card. */
  lines: [number, number] | null
  createdAt: string
}

export interface CardReview {
  accepted?: boolean
  /** What the reviewer did with the agent's provisional comment. */
  provisional?: 'dismissed' | 'adopted'
}

export interface ReviewState {
  cards: Record<string, CardReview>
  comments: ReviewComment[]
  /** Paths unchecked in the file filter; cards that touch only these are hidden. */
  hiddenFiles: string[]
}

export interface Session {
  key: string
  /** Identifies the file for auto-save; empty when it could not be computed. */
  saveKey: string
  fileName: string
  /** The parsed file as loaded; unknown fields survive a download. */
  raw: Record<string, unknown>
  title: string
  description: string
  deck: DeckCard[]
  edges: Edge[]
  review: ReviewState
  warnings: string[]
  /** The review came from this browser's auto-save rather than the file. */
  restored: boolean
}
