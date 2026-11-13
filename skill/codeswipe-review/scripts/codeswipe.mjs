#!/usr/bin/env node
// codeswipe helper: zero dependencies, Node 18+.
//
//   node codeswipe.mjs annotate <diff>                    print the diff with line numbers
//   node codeswipe.mjs build <diff> <plan.json> [-o out]  embed the diff into a metadata file
//   node codeswipe.mjs validate <file.codeswipe.json>     check an existing metadata file

import { readFileSync, writeFileSync } from 'node:fs'

const MAX_ROWS = 26
const SEVERITIES = ['reject', 'comment', 'question']

function readText(path) {
  const buf = readFileSync(path)
  // PowerShell's `>` redirection writes UTF-16; cope with it.
  const utf16 = buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe
  const text = utf16 ? buf.toString('utf16le') : buf.toString('utf8')
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
}

const stripPath = (p) => {
  const path = p.split('\t')[0].trim()
  return path === '/dev/null' ? path : path.replace(/^[ab]\//, '')
}

/** Returns one entry per diff line; body lines carry { type, file, oldNo, newNo }. */
function parseDiff(diff) {
  const lines = diff.split('\n')
  const rows = []
  let file = ''
  let oldPath = ''
  let hunk = -1
  let oldLeft = 0
  let newLeft = 0
  let oldNo = 0
  let newNo = 0
  lines.forEach((line, i) => {
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
  return { lines, rows }
}

function toRanges(indices) {
  const out = []
  for (const i of indices) {
    const last = out[out.length - 1]
    if (last && last[1] === i - 1) last[1] = i
    else out.push([i, i])
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`))
}

function validate(meta) {
  const errors = []
  const warnings = []
  const notes = []
  if (!meta || typeof meta !== 'object') return { errors: ['metadata is not an object'], warnings, notes }
  if (typeof meta.diff !== 'string' || !meta.diff.trim()) {
    return { errors: ['"diff" must be a non-empty string'], warnings, notes }
  }
  const { rows } = parseDiff(meta.diff.replace(/\r\n?/g, '\n'))
  if (!rows.length) errors.push('no hunks found in the diff: is it a unified diff?')
  if (!Array.isArray(meta.cards) || !meta.cards.length) {
    errors.push('"cards" must be a non-empty array')
    return { errors, warnings, notes }
  }

  const ids = new Set()
  const owner = new Map()
  const fileOrder = []
  let splitCount = 0
  meta.cards.forEach((card, n) => {
    const where = `cards[${n}]${card && card.id ? ` (${card.id})` : ''}`
    if (!card || typeof card !== 'object') return errors.push(`${where}: not an object`)
    if (typeof card.id !== 'string' || !card.id) errors.push(`${where}: "id" must be a non-empty string`)
    else if (card.id.includes('#')) errors.push(`${where}: "id" must not contain "#"`)
    else if (ids.has(card.id)) errors.push(`${where}: duplicate id`)
    else ids.add(card.id)
    if (typeof card.title !== 'string' || !card.title.trim()) errors.push(`${where}: "title" is required`)
    if (card.attention === undefined) warnings.push(`${where}: no "attention" score, defaults to 0`)
    else if (typeof card.attention !== 'number' || card.attention < 0 || card.attention > 10) {
      errors.push(`${where}: "attention" must be a number from 0 to 10`)
    }
    const pc = card.provisionalComment
    if (pc !== undefined && pc !== null) {
      const text = typeof pc === 'string' ? pc : pc.text
      if (typeof text !== 'string' || !text.trim()) errors.push(`${where}: provisionalComment needs "text"`)
      if (typeof pc === 'object' && pc.severity !== undefined && !SEVERITIES.includes(pc.severity)) {
        errors.push(`${where}: provisionalComment.severity must be one of ${SEVERITIES.join(', ')}`)
      }
      if ((card.attention ?? 0) < 6) {
        warnings.push(`${where}: has a provisional comment but attention is below 6`)
      }
    }
    const l = card.lines
    if (!Array.isArray(l) || l.length !== 2 || !Number.isInteger(l[0]) || !Number.isInteger(l[1]) || l[0] > l[1]) {
      return errors.push(`${where}: "lines" must be [start, end] diff line numbers with start <= end`)
    }
    const mine = rows.filter((r) => r.idx >= l[0] && r.idx <= l[1])
    if (!mine.length) return errors.push(`${where}: lines ${l[0]}-${l[1]} contain no hunk body lines`)
    const files = [...new Set(mine.map((r) => r.file))]
    if (files.length > 1) errors.push(`${where}: spans several files (${files.join(', ')}); use one card per file`)
    if (fileOrder[fileOrder.length - 1] !== files[0]) {
      if (fileOrder.includes(files[0])) {
        warnings.push(`${where}: returns to ${files[0]} after other files; keep all cards of one file together`)
      }
      fileOrder.push(files[0])
    }
    if (!mine.some((r) => r.type !== 'ctx')) warnings.push(`${where}: contains only context lines, no changes`)
    for (const r of mine) {
      if (owner.has(r.idx)) {
        errors.push(`${where}: diff line ${r.idx} is already in card "${owner.get(r.idx)}"`)
        break
      }
    }
    for (const r of mine) owner.set(r.idx, card.id)
    if (mine.length > MAX_ROWS) {
      const parts = Math.ceil(mine.length / MAX_ROWS)
      splitCount += parts - 1
      notes.push(`${where}: ${mine.length} lines, the app will split it into ${parts} cards (limit is ${MAX_ROWS})`)
    }
  })

  const uncovered = rows.filter((r) => r.type !== 'ctx' && !owner.has(r.idx)).map((r) => r.idx)
  if (uncovered.length) {
    warnings.push(
      `${uncovered.length} changed diff line(s) are not in any card (${toRanges(uncovered).join(', ')}); ` +
        'the app will append them as "unassigned" cards at the end',
    )
  }

  const order = new Map(meta.cards.map((c, i) => [c && c.id, i]))
  const seen = new Set()
  if (meta.relations !== undefined && !Array.isArray(meta.relations)) errors.push('"relations" must be an array')
  for (const [n, rel] of (Array.isArray(meta.relations) ? meta.relations : []).entries()) {
    const where = `relations[${n}]`
    if (!rel || !ids.has(rel.from)) errors.push(`${where}: "from" is not a card id (${rel && rel.from})`)
    else if (!ids.has(rel.to)) errors.push(`${where}: "to" is not a card id (${rel.to})`)
    else if (rel.from === rel.to) errors.push(`${where}: a card cannot relate to itself`)
    else {
      const key = `${rel.from}>${rel.to}`
      if (seen.has(key)) warnings.push(`${where}: duplicate of an earlier relation`)
      seen.add(key)
      if (order.get(rel.to) > order.get(rel.from)) {
        notes.push(`${where}: "${rel.from}" is shown before "${rel.to}", which it depends on. Intentional?`)
      }
    }
  }
  const total = rows.filter((r) => r.type !== 'ctx').length
  notes.push(
    `${meta.cards.length} cards (${meta.cards.length + splitCount} after splitting), ` +
      `${total - uncovered.length}/${total} changed lines covered`,
  )
  return { errors, warnings, notes }
}

function report({ errors, warnings, notes }) {
  for (const n of notes) console.log(`note:    ${n}`)
  for (const w of warnings) console.log(`warning: ${w}`)
  for (const e of errors) console.log(`error:   ${e}`)
  console.log(errors.length ? `\nFAILED with ${errors.length} error(s)` : '\nOK')
  return errors.length === 0
}

function annotate(path) {
  const { lines, rows } = parseDiff(readText(path))
  const byIdx = new Map(rows.map((r) => [r.idx, r]))
  const pad = (v, w) => String(v ?? '').padStart(w)
  console.log(`${pad('diff', 5)} | ${pad('old', 5)} | ${pad('new', 5)} |`)
  lines.forEach((line, i) => {
    const r = byIdx.get(i + 1)
    console.log(`${pad(i + 1, 5)} | ${pad(r?.oldNo, 5)} | ${pad(r?.newNo, 5)} | ${line}`)
  })
  console.log('\nOnly lines with an old or new number are hunk body lines. Card "lines" must start and end on those.')
}

function build(diffPath, planPath, outPath) {
  const diff = readText(diffPath)
  const plan = JSON.parse(readText(planPath))
  const meta = {
    format: 'codeswipe',
    version: 1,
    title: plan.title ?? 'Code review',
    description: plan.description ?? '',
    createdAt: new Date().toISOString(),
    diff,
    cards: plan.cards,
    relations: plan.relations ?? [],
  }
  if (!report(validate(meta))) process.exit(1)
  writeFileSync(outPath, JSON.stringify(meta, null, 2))
  console.log(`wrote ${outPath}`)
}

const [cmd, ...args] = process.argv.slice(2)
const flag = args.indexOf('-o')
const out = flag >= 0 ? args.splice(flag, 2)[1] : undefined

if (cmd === 'annotate' && args[0]) annotate(args[0])
else if (cmd === 'build' && args[1]) build(args[0], args[1], out ?? 'review.codeswipe.json')
else if (cmd === 'validate' && args[0]) process.exit(report(validate(JSON.parse(readText(args[0])))) ? 0 : 1)
else {
  console.log(
    [
      'usage:',
      '  node codeswipe.mjs annotate <diff>',
      '  node codeswipe.mjs build <diff> <plan.json> [-o review.codeswipe.json]',
      '  node codeswipe.mjs validate <file.codeswipe.json>',
    ].join('\n'),
  )
  process.exit(1)
}
