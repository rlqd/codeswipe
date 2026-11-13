import type { DiffRow } from './types.ts'

export const normalizeEol = (text: string) => text.replace(/\r\n?/g, '\n')

function stripPath(raw: string): string {
  const path = raw.split('\t')[0].trim()
  return path === '/dev/null' ? path : path.replace(/^[ab]\//, '')
}

/**
 * Parses a unified diff into its hunk body lines. Must stay in step with the
 * parser in skill/codeswipe-review/scripts/codeswipe.mjs: cards address the
 * diff by line number, so both sides have to agree on what a body line is.
 */
export function parseDiff(diff: string): DiffRow[] {
  const rows: DiffRow[] = []
  let file = ''
  let oldPath = ''
  let hunk = -1
  let oldLeft = 0
  let newLeft = 0
  let oldNo = 0
  let newNo = 0
  normalizeEol(diff)
    .split('\n')
    .forEach((line, i) => {
      const idx = i + 1
      if (oldLeft > 0 || newLeft > 0) {
        const c = line[0]
        if (c === '\\') return
        if (c === '+' && newLeft > 0) {
          rows.push({ idx, type: 'add', file, hunk, oldNo: null, newNo: newNo++, text: line.slice(1) })
          newLeft--
          return
        }
        if (c === '-' && oldLeft > 0) {
          rows.push({ idx, type: 'del', file, hunk, oldNo: oldNo++, newNo: null, text: line.slice(1) })
          oldLeft--
          return
        }
        if ((c === ' ' || line === '') && oldLeft > 0 && newLeft > 0) {
          rows.push({ idx, type: 'ctx', file, hunk, oldNo: oldNo++, newNo: newNo++, text: line.slice(1) })
          oldLeft--
          newLeft--
          return
        }
        oldLeft = newLeft = 0
      }
      if (line.startsWith('diff --git ')) {
        const m = / b\/(.+)$/.exec(line)
        file = m ? m[1] : ''
      } else if (line.startsWith('--- ')) {
        oldPath = stripPath(line.slice(4))
      } else if (line.startsWith('+++ ')) {
        const p = stripPath(line.slice(4))
        file = p === '/dev/null' ? oldPath : p
      } else {
        const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)
        if (m) {
          hunk++
          oldNo = Number(m[1])
          newNo = Number(m[3])
          oldLeft = m[2] === undefined ? 1 : Number(m[2])
          newLeft = m[4] === undefined ? 1 : Number(m[4])
        }
      }
    })
  return rows
}
