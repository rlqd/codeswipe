import { cardFiles } from './deck.ts'
import type { DeckCard } from './types.ts'

export interface TreeNode {
  /** Label; a chain of single-child folders is shown as one, like `src/lib`. */
  name: string
  path: string
  /** Null for a folder. */
  file: string | null
  /** Every file at or below this node. */
  files: string[]
  /** Cards that show code from any of those files. */
  cards: number
  children: TreeNode[]
}

const foldersFirst = (a: TreeNode, b: TreeNode) =>
  Number(a.file !== null) - Number(b.file !== null) || a.name.localeCompare(b.name)

/** The files of a deck as a folder tree, folders first. */
export function buildTree(deck: DeckCard[]): TreeNode[] {
  const perCard = deck.map(cardFiles)
  const make = (name: string, path: string, file: string | null): TreeNode => ({
    name,
    path,
    file,
    files: file === null ? [] : [file],
    cards: 0,
    children: [],
  })
  const root = make('', '', null)
  for (const file of new Set(perCard.flat())) {
    const parts = file.split('/')
    let node = root
    parts.forEach((part, i) => {
      const leaf = i === parts.length - 1
      const path = parts.slice(0, i + 1).join('/')
      let next = node.children.find((c) => c.path === path && (c.file !== null) === leaf)
      if (!next) {
        next = make(part, path, leaf ? file : null)
        node.children.push(next)
      }
      if (!leaf) next.files.push(file)
      node = next
    })
  }
  const finish = (start: TreeNode): TreeNode => {
    // Fold `src` > `lib` into `src/lib` when `src` holds nothing else.
    let node = start
    while (node.file === null && node.children.length === 1 && node.children[0].file === null) {
      const only = node.children[0]
      node = { ...only, name: `${node.name}/${only.name}` }
    }
    const inside = new Set(node.files)
    return {
      ...node,
      cards: perCard.filter((files) => files.some((f) => inside.has(f))).length,
      children: node.children.map(finish).sort(foldersFirst),
    }
  }
  return root.children.map(finish).sort(foldersFirst)
}
