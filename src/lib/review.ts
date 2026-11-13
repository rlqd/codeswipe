import type { DeckCard, ReviewComment, ReviewState, Severity, Status } from './types.ts'

export type Action =
  | { type: 'accept'; card: string; dismissProvisional?: boolean }
  | { type: 'unaccept'; card: string }
  | { type: 'saveComment'; comment: ReviewComment; adoptProvisional?: boolean }
  | { type: 'deleteComment'; id: string }

export const emptyReview = (): ReviewState => ({ cards: {}, comments: [] })

export function reducer(state: ReviewState, action: Action): ReviewState {
  const patchCard = (id: string, patch: ReviewState['cards'][string]) => ({
    ...state.cards,
    [id]: { ...state.cards[id], ...patch },
  })
  switch (action.type) {
    case 'accept':
      return {
        ...state,
        cards: patchCard(action.card, {
          accepted: true,
          ...(action.dismissProvisional ? { provisional: 'dismissed' as const } : {}),
        }),
      }
    case 'unaccept':
      return { ...state, cards: patchCard(action.card, { accepted: false }) }
    case 'saveComment': {
      const { comment } = action
      const exists = state.comments.some((c) => c.id === comment.id)
      return {
        cards: action.adoptProvisional ? patchCard(comment.card, { provisional: 'adopted' }) : state.cards,
        comments: exists
          ? state.comments.map((c) => (c.id === comment.id ? comment : c))
          : [...state.comments, comment],
      }
    }
    case 'deleteComment':
      return { ...state, comments: state.comments.filter((c) => c.id !== action.id) }
  }
}

export const commentsOf = (review: ReviewState, card: string) => review.comments.filter((c) => c.card === card)

export const isReviewed = (review: ReviewState, card: string) =>
  Boolean(review.cards[card]?.accepted) || review.comments.some((c) => c.card === card)

const RANK: Severity[] = ['reject', 'question', 'comment']

/** Comments win over an accept, and the most severe comment sets the colour. */
export function cardStatus(review: ReviewState, card: string): Status {
  const mine = commentsOf(review, card)
  const worst = RANK.find((s) => mine.some((c) => c.severity === s))
  return worst ?? (review.cards[card]?.accepted ? 'accepted' : 'none')
}

/** Share of the changed code that has been reviewed, 0 to 1. */
export function progress(deck: DeckCard[], review: ReviewState): number {
  const total = deck.reduce((sum, c) => sum + c.weight, 0)
  const done = deck.reduce((sum, c) => sum + (isReviewed(review, c.id) ? c.weight : 0), 0)
  return total ? done / total : 0
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
