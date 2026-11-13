import { useEffect, useEffectEvent, useRef, useState } from 'react'
import skillMd from '../../skill/codeswipe-review/SKILL.md?raw'
import skillScript from '../../skill/codeswipe-review/scripts/codeswipe.mjs?raw'
import { download } from '../lib/metadata.ts'
import { makeZip } from '../lib/zip.ts'

const SKILL_FILES = [
  { path: 'codeswipe-review/SKILL.md', content: skillMd },
  { path: 'codeswipe-review/scripts/codeswipe.mjs', content: skillScript },
]

interface Props {
  error: string | null
  onLoad: (text: string, fileName: string) => void
}

export function Home({ error, onLoad }: Props) {
  const [over, setOver] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const open = async (file: File | undefined) => {
    if (file) onLoad(await file.text(), file.name)
  }

  // The whole window is the drop target, so a near miss does not make the
  // browser navigate away to the dropped file.
  const onDrop = useEffectEvent((e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    void open(e.dataTransfer?.files[0])
  })
  useEffect(() => {
    let depth = 0
    const enter = () => setOver(++depth > 0)
    const leave = () => setOver(--depth > 0)
    const hover = (e: DragEvent) => e.preventDefault()
    const drop = (e: DragEvent) => {
      depth = 0
      onDrop(e)
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', hover)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', hover)
      window.removeEventListener('drop', drop)
    }
  }, [])

  const copy = async (path: string, content: string) => {
    await navigator.clipboard.writeText(content)
    setCopied(path)
    setTimeout(() => setCopied(null), 1500)
  }

  const loadSample = async () => {
    const sample = await import('../sample/sample.codeswipe.json?raw')
    onLoad(sample.default, 'sample.codeswipe.json')
  }

  return (
    <main className="home">
      <h1>
        code<span>swipe</span>
      </h1>
      <p className="tagline">Code review, one card at a time. Swipe right to accept, left to comment.</p>

      <button type="button" className={`drop${over ? ' over' : ''}`} onClick={() => input.current?.click()}>
        <strong>Drop a .codeswipe.json file here</strong>
        <span>or click to choose one. Nothing leaves your browser.</span>
      </button>
      <input ref={input} type="file" accept=".json,.diff,.patch,.txt" hidden onChange={(e) => void open(e.target.files?.[0])} />
      {error && <p className="error">{error}</p>}

      <div className="home-links">
        <button type="button" className="btn" onClick={() => void loadSample()}>
          Try a sample review
        </button>
      </div>

      <ol className="steps">
        <li>
          <p>
            <b>Give your coding agent the skill.</b> Unzip it into the agent's skills folder, for example{' '}
            <code>.claude/skills/</code>.
          </p>
          <button
            type="button"
            className="btn primary"
            onClick={() => download('codeswipe-review.zip', makeZip(SKILL_FILES), 'application/zip')}
          >
            Download skill (.zip)
          </button>
          <ul className="files">
            {SKILL_FILES.map((f) => (
              <li key={f.path}>
                <code>{f.path}</code>
                <button type="button" className="link" onClick={() => void copy(f.path, f.content)}>
                  {copied === f.path ? 'copied' : 'copy'}
                </button>
                <button type="button" className="link" onClick={() => download(f.path.split('/').pop()!, f.content)}>
                  download
                </button>
              </li>
            ))}
          </ul>
        </li>
        <li>
          <p>
            <b>Ask for a review file.</b> Something like "prepare a codeswipe review of this branch". The agent splits
            the diff into ordered cards and adds its own comments.
          </p>
        </li>
        <li>
          <p>
            <b>Drop the file above and swipe.</b> Save your progress at any time, as a download or automatically in this
            browser, and export your comments as Markdown when you are done.
          </p>
        </li>
      </ol>
    </main>
  )
}
