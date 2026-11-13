import { useEffect, useState } from 'react'
import { visibleDeck } from '../lib/deck.ts'
import { buildTree, type TreeNode } from '../lib/filetree.ts'
import type { DeckCard } from '../lib/types.ts'
import { Modal } from './Dialogs.tsx'

interface Props {
  deck: DeckCard[]
  hidden: string[]
  onChange: (hidden: string[]) => void
  onClose: () => void
}

export function FileFilter({ deck, hidden, onChange, onClose }: Props) {
  const tree = buildTree(deck)
  const [closed, setClosed] = useState<string[]>([])
  const shown = visibleDeck(deck, hidden).length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setChecked = (node: TreeNode, checked: boolean) => {
    const rest = hidden.filter((f) => !node.files.includes(f))
    onChange(checked ? rest : [...rest, ...node.files])
  }

  const renderNode = (node: TreeNode, depth: number) => {
    const off = node.files.filter((f) => hidden.includes(f)).length
    const folder = node.file === null
    const open = !closed.includes(node.path)
    return (
      <li key={`${node.path}:${folder}`}>
        <div className="tree-row" style={{ paddingLeft: depth * 18 }}>
          {folder ? (
            <button
              type="button"
              className="tree-fold"
              aria-expanded={open}
              title={open ? 'Collapse' : 'Expand'}
              onClick={() => setClosed(open ? [...closed, node.path] : closed.filter((p) => p !== node.path))}
            >
              {open ? '▾' : '▸'}
            </button>
          ) : (
            <span className="tree-fold" />
          )}
          <label>
            <input
              type="checkbox"
              checked={off === 0}
              ref={(el) => {
                if (el) el.indeterminate = off > 0 && off < node.files.length
              }}
              onChange={(e) => setChecked(node, e.target.checked)}
            />
            <span className={folder ? 'tree-dir' : 'tree-file'}>{folder ? `${node.name}/` : node.name}</span>
          </label>
          <span className="tree-count" title="Cards with code from here">
            {node.cards}
          </span>
        </div>
        {folder && open && <ul>{node.children.map((child) => renderNode(child, depth + 1))}</ul>}
      </li>
    )
  }

  return (
    <Modal onClose={onClose}>
      <h3>Files</h3>
      <p className="modal-note">
        Cards from unchecked files and folders are hidden. A card that spans several files stays until all of them are
        unchecked.
      </p>
      <ul className="tree">{tree.map((node) => renderNode(node, 0))}</ul>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => onChange([])} disabled={!hidden.length}>
          Check all
        </button>
        <span className="modal-note">
          {shown} of {deck.length} cards shown
        </span>
        <span className="spacer" />
        <button type="button" className="btn primary" onClick={onClose} autoFocus>
          Done
        </button>
      </div>
    </Modal>
  )
}
