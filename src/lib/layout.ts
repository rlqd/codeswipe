export const NODE_W = 210
export const NODE_H = 56
const COL_GAP = 96
const ROW_GAP = 24
const GROUP_GAP = 72
const GRID_GAP = 28

export interface Point {
  x: number
  y: number
}

export interface Layout {
  pos: Record<string, Point>
  /** Top-left corner of the grid of unconnected nodes, if there are any. */
  standalone: Point | null
}

/**
 * Connected groups are drawn as columns, dependents on the left and what they
 * depend on to the right, and stacked under each other. Nodes without any
 * relation go into a grid beside the groups.
 */
export function layoutGraph(ids: string[], edges: { from: string; to: string }[]): Layout {
  const order = new Map(ids.map((id, i) => [id, i]))
  const preds = new Map<string, string[]>(ids.map((id) => [id, []]))
  const neighbours = new Map<string, string[]>(ids.map((id) => [id, []]))
  for (const e of edges) {
    if (!order.has(e.from) || !order.has(e.to)) continue
    preds.get(e.to)!.push(e.from)
    neighbours.get(e.from)!.push(e.to)
    neighbours.get(e.to)!.push(e.from)
  }

  const groups: string[][] = []
  const singles: string[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) continue
    const group: string[] = []
    const queue = [id]
    seen.add(id)
    while (queue.length) {
      const n = queue.shift()!
      group.push(n)
      for (const m of neighbours.get(n)!) {
        if (!seen.has(m)) {
          seen.add(m)
          queue.push(m)
        }
      }
    }
    if (group.length === 1) singles.push(id)
    else groups.push(group)
  }

  // Longest path from a node nobody depends on; back edges of cycles are ignored.
  const layer = new Map<string, number>()
  const visiting = new Set<string>()
  const layerOf = (id: string): number => {
    const known = layer.get(id)
    if (known !== undefined) return known
    if (visiting.has(id)) return -1
    visiting.add(id)
    let l = 0
    for (const p of preds.get(id)!) l = Math.max(l, layerOf(p) + 1)
    visiting.delete(id)
    layer.set(id, l)
    return l
  }

  const pos: Record<string, Point> = {}
  let top = 0
  let right = 0
  for (const group of groups) {
    const columns: string[][] = []
    for (const id of group) (columns[layerOf(id)] ??= []).push(id)
    const cols = columns.filter(Boolean)
    const slot = new Map<string, number>()
    cols.forEach((col, c) => {
      // Order a column by where its neighbours in earlier columns ended up.
      const weight = (id: string) => {
        const placed = preds.get(id)!.filter((p) => slot.has(p))
        return placed.length ? placed.reduce((s, p) => s + slot.get(p)!, 0) / placed.length : order.get(id)! / ids.length
      }
      if (c > 0) col.sort((a, b) => weight(a) - weight(b) || order.get(a)! - order.get(b)!)
      col.forEach((id, i) => slot.set(id, i - (col.length - 1) / 2))
    })
    const tallest = Math.max(...cols.map((col) => col.length))
    const height = tallest * NODE_H + (tallest - 1) * ROW_GAP
    cols.forEach((col, c) => {
      const colHeight = col.length * NODE_H + (col.length - 1) * ROW_GAP
      col.forEach((id, i) => {
        pos[id] = { x: c * (NODE_W + COL_GAP), y: top + (height - colHeight) / 2 + i * (NODE_H + ROW_GAP) }
      })
    })
    right = Math.max(right, cols.length * NODE_W + (cols.length - 1) * COL_GAP)
    top += height + GROUP_GAP
  }

  if (!singles.length) return { pos, standalone: null }
  const origin = { x: groups.length ? right + 140 : 0, y: 0 }
  const perRow = singles.length <= 4 ? 1 : singles.length <= 12 ? 2 : 3
  singles.forEach((id, i) => {
    pos[id] = {
      x: origin.x + (i % perRow) * (NODE_W + GRID_GAP),
      y: origin.y + Math.floor(i / perRow) * (NODE_H + GRID_GAP),
    }
  })
  return { pos, standalone: origin }
}
