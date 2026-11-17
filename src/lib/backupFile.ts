import { backupFileName, exportBackup, markBackedUp } from './backup'
import type { RunwayDB } from './db'
import { localToday } from './device'

export type SaveResult = 'shared' | 'downloaded' | 'cancelled'

/**
 * Save a backup file. On the phone this opens the share sheet, so it can go to Google Drive,
 * Files or email. Elsewhere it downloads. Only a completed save counts as a backup.
 */
export async function saveBackupFile(db: RunwayDB): Promise<SaveResult> {
  const backup = await exportBackup(db)
  const name = backupFileName(localToday())
  const file = new File([JSON.stringify(backup, null, 2)], name, { type: 'application/json' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Runway backup' })
      await markBackedUp(db)
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // Sharing failed for another reason: fall back to a download.
    }
  }

  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  await markBackedUp(db)
  return 'downloaded'
}
