import { useLiveQuery } from 'dexie-react-hooks'
import { useId, useRef, useState } from 'react'
import { parseBackup, restoreBackup, summarise, type Backup } from '../lib/backup'
import { saveBackupFile } from '../lib/backupFile'
import { db } from '../lib/db'
import { plural } from '../lib/format'
import { formatGBP } from '../lib/money'
import { Sheet } from './Sheet'

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Settings card: save a backup, restore one. */
export function BackupCard() {
  const settings = useLiveQuery(() => db.settings.get('main'))
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <section className="card">
      <h2>Backup</h2>
      <p className="muted small">
        Your data lives only on this phone. Save a copy to Google Drive or Files now and then, so
        you can restore it if the phone is lost or reset.
      </p>
      <p className="small spaced">
        {settings?.lastBackupAt
          ? `Last saved ${formatWhen(settings.lastBackupAt)}`
          : 'No backup saved yet.'}
      </p>
      <button
        className="button primary wide spaced"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setMessage('')
          try {
            const result = await saveBackupFile(db)
            if (result === 'downloaded') setMessage('Saved to Downloads.')
            if (result === 'shared') setMessage('Backup saved.')
          } catch {
            setMessage('That didn’t save. Please try again.')
          } finally {
            setBusy(false)
          }
        }}
      >
        Save a backup
      </button>
      <p className="muted small" role="status">
        {message || ' '}
      </p>
      <RestoreButton label="Restore from a backup" />
    </section>
  )
}

/** Pick a backup file, preview it, then replace everything on confirm. */
export function RestoreButton({ label }: { label: string }) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [backup, setBackup] = useState<Backup | null>(null)
  const [error, setError] = useState('')
  const [restoring, setRestoring] = useState(false)
  const summary = backup && summarise(backup)

  return (
    <>
      <label htmlFor={id} className="button secondary wide file-button">
        {label}
      </label>
      <input
        ref={input}
        id={id}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          setError('')
          if (file.size > 20_000_000) return setError('That file is too big to be a Runway backup.')
          const result = parseBackup(await file.text())
          if (result.ok) setBackup(result.backup)
          else setError(result.error)
        }}
      />
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}

      <Sheet open={backup !== null} title="Restore this backup?" onClose={() => setBackup(null)}>
        {summary && (
          <>
            <ul className="rows">
              <li className="row">
                <span>Saved</span>
                <span>{formatWhen(summary.exportedAt)}</span>
              </li>
              <li className="row">
                <span>Balance</span>
                <span className="amount">
                  {summary.balance === null ? '–' : formatGBP(summary.balance)}
                </span>
              </li>
              <li className="row">
                <span>Bills and pots</span>
                <span>
                  {plural(summary.bills, 'bill')}, {plural(summary.pots, 'pot')}
                </span>
              </li>
              <li className="row">
                <span>Food spends</span>
                <span>{summary.foodSpends}</span>
              </li>
            </ul>
            <p className="muted small spaced">
              This replaces everything on this phone with the backup. Update your balance afterwards
              if it has changed.
            </p>
            <div className="sheet-actions">
              <button className="button secondary" onClick={() => setBackup(null)}>
                Cancel
              </button>
              <button
                className="button danger"
                disabled={restoring}
                onClick={async () => {
                  setRestoring(true)
                  try {
                    await restoreBackup(db, backup!)
                    setBackup(null)
                    window.location.hash = '#/'
                  } catch {
                    setError('Restoring didn’t work. Nothing was changed.')
                    setBackup(null)
                  } finally {
                    setRestoring(false)
                  }
                }}
              >
                Replace
              </button>
            </div>
          </>
        )}
      </Sheet>
    </>
  )
}
