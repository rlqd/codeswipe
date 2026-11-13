export interface Token {
  text: string
  cls?: 'tk-com' | 'tk-str' | 'tk-num' | 'tk-kw' | 'tk-fn' | 'tk-type'
}

const KEYWORDS = new Set(
  (
    'abstract as async await break case catch class const continue def default defer delete do elif else enum ' +
    'except export extends false final finally fn for from func function if impl implements import in instanceof ' +
    'interface is let match mod mut new nil none None null of package pass private protected pub public raise ' +
    'readonly return self static struct super switch this throw trait true True False try type typeof undefined ' +
    'use var void while with yield'
  ).split(' '),
)

const SLASH = /\.(m?[jt]sx?|c|h|cc|cpp|hpp|cs|java|kt|go|rs|swift|php|scala|dart|s?css|less|proto)$/i
const HASH = /(\.(py|rb|sh|bash|zsh|ya?ml|toml|pl|r|tf|ini|conf)|Dockerfile|Makefile)$/i
const PROSE = /\.(md|mdx|txt|rst|csv|svg|html?|xml|lock)$/i

const STRING = `"(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\``
const REST = `\\b\\d[\\w.]*\\b|[A-Za-z_$][\\w$]*`
const patterns = {
  slash: new RegExp(`(\\/\\/.*$|\\/\\*.*?(?:\\*\\/|$))|(${STRING})|(${REST})`, 'g'),
  hash: new RegExp(`(#.*$)|(${STRING})|(${REST})`, 'g'),
  none: new RegExp(`($^)|(${STRING})|(${REST})`, 'g'),
}

/**
 * A deliberately small, line-at-a-time highlighter: comments, strings,
 * numbers, keywords, calls and capitalised names. It knows nothing that spans
 * lines, which is the price of not shipping a grammar per language.
 */
export function highlight(line: string, file: string): Token[] {
  if (PROSE.test(file) || line.length > 400) return [{ text: line }]
  const re = SLASH.test(file) ? patterns.slash : HASH.test(file) ? patterns.hash : patterns.none
  re.lastIndex = 0
  const out: Token[] = []
  let last = 0
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m[0] === '') {
      re.lastIndex++
      continue
    }
    if (m.index > last) out.push({ text: line.slice(last, m.index) })
    const text = m[0]
    let cls: Token['cls']
    if (m[1]) cls = 'tk-com'
    else if (m[2]) cls = 'tk-str'
    else if (/^\d/.test(text)) cls = 'tk-num'
    else if (KEYWORDS.has(text)) cls = 'tk-kw'
    else if (line[re.lastIndex] === '(') cls = 'tk-fn'
    else if (/^[A-Z][a-z]/.test(text)) cls = 'tk-type'
    out.push({ text, cls })
    last = re.lastIndex
  }
  if (last < line.length) out.push({ text: line.slice(last) })
  return out
}
