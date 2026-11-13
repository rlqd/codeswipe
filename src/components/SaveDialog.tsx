import { useEffect, useState } from 'react'
import { Modal } from './Dialogs.tsx'

interface Props {
  autoSave: boolean
  /** The last auto-save did not reach the browser's storage. */
  failed: boolean
  onToggle: (on: boolean) => void
  onDownload: () => void
  /** Removes the auto-saved progress of every file. */
  onClear: () => Promise<void>
  onClose: () => void
}

export function SaveDialog({ autoSave, failed, onToggle, onDownload, onClear, onClose }: Props) {
  const [cleared, setCleared] = useState<'no' | 'yes' | 'failed'>('no')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const clear = async () => {
    if (!window.confirm('Remove the auto-saved progress of every review file from this browser?')) return
    try {
      await onClear()
      setCleared('yes')
    } catch {
      setCleared('failed')
    }
  }

  return (
    <Modal onClose={onClose}>
      <h3>Save progress</h3>
      <label className="wrap-toggle save-toggle">
        <input
          type="checkbox"
          checked={autoSave}
          onChange={(e) => {
            setCleared('no')
            onToggle(e.target.checked)
          }}
        />
        Auto-save locally
      </label>
      <p className={`modal-note${autoSave && failed ? ' failed' : ''}`}>
        {!autoSave
          ? 'Off. Turn it on to keep your progress in this browser after every action, and get it back when you open the same file again.'
          : failed
            ? 'This browser refused to store the progress. Download the file instead.'
            : 'On. Your progress is stored in this browser after every action, and restored when you open the same file again.'}
      </p>
      {!autoSave && (
        <div className="modal-actions">
          <button type="button" className="btn danger" onClick={() => void clear()} disabled={cleared === 'yes'}>
            Clear local storage
          </button>
          <span className={`modal-note${cleared === 'failed' ? ' failed' : ''}`}>
            {cleared === 'yes'
              ? 'Removed.'
              : cleared === 'failed'
                ? 'Could not clear the storage.'
                : 'Removes the auto-saved progress of all files.'}
          </span>
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>
          Close <kbd>Esc</kbd>
        </button>
        <span className="spacer" />
        <button type="button" className="btn primary" onClick={onDownload} title="The review file with your progress inside">
          Download json
        </button>
      </div>
    </Modal>
  )
}
