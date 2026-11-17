import type {
  BalanceEntry,
  BankHolidayEdit,
  DoneEntry,
  FoodSpendEntry,
  MonthlyEntry,
  PaydayOverride,
  RunwayDB,
  Settings,
} from './db'
import { assertISODate, assertPence, type ISODate } from './money'

/**
 * Backup files: everything in the database as JSON. The file is the only copy outside the phone,
 * so reading one back is strict: anything that doesn't look exactly right is refused before any
 * existing data is touched.
 */

export const BACKUP_APP = 'runway'
export const BACKUP_FORMAT = 1

export interface BackupData {
  settings: Settings[]
  balance: BalanceEntry[]
  bills: MonthlyEntry[]
  pots: MonthlyEntry[]
  done: DoneEntry[]
  foodSpends: FoodSpendEntry[]
  paydayOverrides: PaydayOverride[]
  bankHolidayEdits: BankHolidayEdit[]
}

export interface Backup {
  app: typeof BACKUP_APP
  format: typeof BACKUP_FORMAT
  exportedAt: string
  data: BackupData
}

export interface BackupSummary {
  exportedAt: string
  balance: number | null
  bills: number
  pots: number
  foodSpends: number
}

const TABLES = [
  'settings',
  'balance',
  'bills',
  'pots',
  'done',
  'foodSpends',
  'paydayOverrides',
  'bankHolidayEdits',
] as const

// --- Export -----------------------------------------------------------------

export async function exportBackup(db: RunwayDB, now = new Date()): Promise<Backup> {
  return db.transaction(
    'r',
    TABLES.map((t) => db[t]),
    async () => {
      const [settings, balance, bills, pots, done, foodSpends, paydayOverrides, bankHolidayEdits] =
        await Promise.all(TABLES.map((t) => db[t].toArray()))
      return {
        app: BACKUP_APP,
        format: BACKUP_FORMAT,
        exportedAt: now.toISOString(),
        data: {
          settings,
          balance,
          bills,
          pots,
          done,
          foodSpends,
          paydayOverrides,
          bankHolidayEdits,
        } as BackupData,
      }
    },
  )
}

export function backupFileName(today: ISODate): string {
  return `runway-backup-${today}.json`
}

/** Record that a backup was saved, for the reminder. */
export async function markBackedUp(db: RunwayDB, at = new Date()): Promise<void> {
  await db.settings.update('main', { lastBackupAt: at.toISOString() })
}

// --- Import -----------------------------------------------------------------

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string }

class BackupError extends Error {}

function fail(message: string): never {
  throw new BackupError(message)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function arrayOf(data: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = data[key]
  if (!Array.isArray(value)) fail(`Missing ${key}`)
  if (!value.every(isObject)) fail(`Unexpected entry in ${key}`)
  return value
}

function pence(value: unknown, label: string, allowNegative = false): number {
  try {
    assertPence(value as number, label)
  } catch {
    fail(`${label} isn’t a whole number of pence`)
  }
  if (!allowNegative && (value as number) < 0) fail(`${label} is below £0`)
  return value as number
}

function date(value: unknown, label: string): string {
  try {
    if (typeof value !== 'string') throw new Error()
    assertISODate(value)
  } catch {
    fail(`${label} isn’t a valid date`)
  }
  return value as string
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) fail(`${label} isn’t a time`)
  return value as string
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} is missing`)
  return value as string
}

function monthly(entry: Record<string, unknown>, table: string): MonthlyEntry {
  const day = entry.dayOfMonth
  if (!Number.isInteger(day) || (day as number) < 1 || (day as number) > 31) {
    fail(`A ${table} day of month is out of range`)
  }
  return {
    id: text(entry.id, `${table} id`),
    name: text(entry.name, `${table} name`),
    amount: pence(entry.amount, `${table} amount`),
    dayOfMonth: day as number,
    active: entry.active !== false,
  }
}

/** Read a backup file's text. Never throws: returns an error message to show instead. */
export function parseBackup(json: string): ParseResult {
  try {
    let raw: unknown
    try {
      raw = JSON.parse(json)
    } catch {
      fail('This file isn’t a Runway backup')
    }
    if (!isObject(raw) || raw.app !== BACKUP_APP) fail('This file isn’t a Runway backup')
    if (raw.format !== BACKUP_FORMAT) {
      fail('This backup was made by a newer version of Runway. Update the app and try again.')
    }
    if (!isObject(raw.data)) fail('This backup is incomplete')
    const d = raw.data

    const settings = arrayOf(d, 'settings').map((s): Settings => ({
      id: 'main',
      buffer: pence(s.buffer, 'Buffer'),
      weeklyFoodFloor: pence(s.weeklyFoodFloor, 'Food per week'),
      plannedDailySpend: pence(s.plannedDailySpend, 'Usual daily spend'),
      foodTrackingStart: date(s.foodTrackingStart, 'Food tracking start'),
      ...(s.lastBackupAt ? { lastBackupAt: timestamp(s.lastBackupAt, 'Last backup') } : {}),
    }))
    if (settings.length > 1) fail('This backup has more than one set of settings')

    const backup: Backup = {
      app: BACKUP_APP,
      format: BACKUP_FORMAT,
      exportedAt: timestamp(raw.exportedAt, 'Backup time'),
      data: {
        settings,
        balance: arrayOf(d, 'balance').map((b) => ({
          ...(Number.isInteger(b.id) ? { id: b.id as number } : {}),
          amount: pence(b.amount, 'Balance', true),
          enteredAt: timestamp(b.enteredAt, 'Balance time'),
          source: b.source === 'food' ? 'food' : 'manual',
        })),
        bills: arrayOf(d, 'bills').map((b) => monthly(b, 'bill')),
        pots: arrayOf(d, 'pots').map((p) => monthly(p, 'pot')),
        done: arrayOf(d, 'done').map((x) => ({
          key: text(x.key, 'Paid tick'),
          doneAt: timestamp(x.doneAt, 'Paid tick time'),
        })),
        foodSpends: arrayOf(d, 'foodSpends').map((f) => ({
          ...(Number.isInteger(f.id) ? { id: f.id as number } : {}),
          date: date(f.date, 'Food spend date'),
          amount: pence(f.amount, 'Food spend'),
          ...(typeof f.note === 'string' && f.note.trim() ? { note: f.note } : {}),
          ...(f.balanceAdjustedAt
            ? { balanceAdjustedAt: timestamp(f.balanceAdjustedAt, 'Food spend time') }
            : {}),
        })),
        paydayOverrides: arrayOf(d, 'paydayOverrides').map((o) => {
          if (typeof o.month !== 'string' || !/^\d{4}-\d{2}$/.test(o.month)) {
            fail('A payday month isn’t valid')
          }
          return { month: o.month as string, date: date(o.date, 'Payday') }
        }),
        bankHolidayEdits: arrayOf(d, 'bankHolidayEdits').map((e) => {
          if (e.action !== 'add' && e.action !== 'remove') fail('A bank holiday change isn’t valid')
          return { date: date(e.date, 'Bank holiday'), action: e.action as 'add' | 'remove' }
        }),
      },
    }
    return { ok: true, backup }
  } catch (error) {
    if (error instanceof BackupError) return { ok: false, error: error.message }
    return { ok: false, error: 'This backup couldn’t be read' }
  }
}

export function summarise(backup: Backup): BackupSummary {
  const latest = [...backup.data.balance].sort((a, b) =>
    a.enteredAt < b.enteredAt ? -1 : a.enteredAt > b.enteredAt ? 1 : 0,
  )
  return {
    exportedAt: backup.exportedAt,
    balance: latest.length ? latest[latest.length - 1].amount : null,
    bills: backup.data.bills.length,
    pots: backup.data.pots.length,
    foodSpends: backup.data.foodSpends.length,
  }
}

/** Replace everything on this phone with the backup, all or nothing. */
export async function restoreBackup(db: RunwayDB, backup: Backup): Promise<void> {
  await db.transaction(
    'rw',
    TABLES.map((t) => db[t]),
    async () => {
      for (const table of TABLES) await db[table].clear()
      const d = backup.data
      await db.settings.bulkAdd(d.settings)
      await db.balance.bulkAdd(d.balance)
      await db.bills.bulkAdd(d.bills)
      await db.pots.bulkAdd(d.pots)
      await db.done.bulkAdd(d.done)
      await db.foodSpends.bulkAdd(d.foodSpends)
      await db.paydayOverrides.bulkAdd(d.paydayOverrides)
      await db.bankHolidayEdits.bulkAdd(d.bankHolidayEdits)
    },
  )
}

// --- Reminder ---------------------------------------------------------------

export const BACKUP_REMINDER_DAYS = 30

/**
 * Days since the last backup, if a reminder is due; otherwise null.
 * With no backup yet, the reminder waits until a week after setup.
 */
export function backupReminder(settings: Settings, now = new Date()): number | 'never' | null {
  const day = 86_400_000
  if (!settings.lastBackupAt) {
    const since = (now.getTime() - Date.parse(`${settings.foodTrackingStart}T00:00:00`)) / day
    return since >= 7 ? 'never' : null
  }
  const days = Math.floor((now.getTime() - Date.parse(settings.lastBackupAt)) / day)
  return days >= BACKUP_REMINDER_DAYS ? days : null
}
