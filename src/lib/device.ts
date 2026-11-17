import type { ISODate } from './money'

/** Today's date on this device, in local time (UK), as 'YYYY-MM-DD'. */
export function localToday(now = new Date()): ISODate {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export type PersistResult = 'granted' | 'denied' | 'unsupported'

/**
 * Ask Chrome to keep Runway's data even when the phone is low on storage.
 * Installed PWAs are normally granted this. Safe to call on every start.
 */
export async function requestPersistentStorage(
  storage: Pick<StorageManager, 'persisted' | 'persist'> | undefined = globalThis.navigator
    ?.storage,
): Promise<PersistResult> {
  if (!storage?.persist) return 'unsupported'
  try {
    if (await storage.persisted()) return 'granted'
    return (await storage.persist()) ? 'granted' : 'denied'
  } catch {
    return 'denied'
  }
}
