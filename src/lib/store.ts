import { applyBankHolidayEdits, ENGLAND_AND_WALES_BANK_HOLIDAYS } from './bankHolidays'
import type { MonthlyEntry, RunwayDB, Settings } from './db'
import {
  assertISODate,
  assertPence,
  occurrenceKey,
  type ISODate,
  type MonthKey,
  type Pence,
  type SafeTodayInput,
} from './money'

/**
 * Reading and writing Runway's data. Every write checks money is whole pence and
 * dates are real, so bad values never reach the database.
 */

function checkDayOfMonth(day: number): number {
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new RangeError(`Day of month must be 1-31, got ${day}`)
  }
  return day
}

function checkName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new RangeError('Name cannot be empty')
  return trimmed
}

function newId(): string {
  return crypto.randomUUID()
}

// --- Settings ---------------------------------------------------------------

export async function getSettings(db: RunwayDB): Promise<Settings | undefined> {
  return db.settings.get('main')
}

export async function saveSettings(db: RunwayDB, settings: Omit<Settings, 'id'>): Promise<void> {
  assertPence(settings.buffer, 'buffer')
  assertPence(settings.weeklyFoodFloor, 'weekly Food Floor')
  assertPence(settings.plannedDailySpend, 'planned daily spend')
  for (const [label, value] of [
    ['buffer', settings.buffer],
    ['weekly Food Floor', settings.weeklyFoodFloor],
    ['planned daily spend', settings.plannedDailySpend],
  ] as const) {
    if (value < 0) throw new RangeError(`${label} cannot be negative`)
  }
  assertISODate(settings.foodTrackingStart)
  await db.settings.put({ id: 'main', ...settings })
}

// --- Balance ----------------------------------------------------------------

export async function setBalance(db: RunwayDB, amount: Pence, at = new Date()): Promise<void> {
  assertPence(amount, 'balance') // may be negative (overdraft)
  await db.balance.add({ amount, enteredAt: at.toISOString() })
}

export async function latestBalance(
  db: RunwayDB,
): Promise<{ amount: Pence; enteredAt: string } | undefined> {
  const entry = await db.balance.orderBy('enteredAt').last()
  return entry && { amount: entry.amount, enteredAt: entry.enteredAt }
}

// --- Bills and pots ---------------------------------------------------------

type MonthlyTable = 'bills' | 'pots'
export type MonthlyInput = Omit<MonthlyEntry, 'id' | 'active'> & { active?: boolean }

function checkMonthly(input: MonthlyInput): MonthlyInput {
  assertPence(input.amount, `amount for ${input.name}`)
  if (input.amount < 0) throw new RangeError('Amount cannot be negative')
  return { ...input, name: checkName(input.name), dayOfMonth: checkDayOfMonth(input.dayOfMonth) }
}

export async function addMonthly(
  db: RunwayDB,
  table: MonthlyTable,
  input: MonthlyInput,
): Promise<string> {
  const id = newId()
  await db[table].add({ active: true, ...checkMonthly(input), id })
  return id
}

export async function updateMonthly(
  db: RunwayDB,
  table: MonthlyTable,
  id: string,
  input: MonthlyInput,
): Promise<void> {
  const existing = await db[table].get(id)
  if (!existing) throw new Error(`No ${table} entry with id ${id}`)
  await db[table].put({ ...existing, ...checkMonthly(input), id })
}

export async function deleteMonthly(db: RunwayDB, table: MonthlyTable, id: string): Promise<void> {
  await db.transaction('rw', db[table], db.done, async () => {
    await db[table].delete(id)
    await db.done.where('key').startsWith(`${id}@`).delete()
  })
}

/** Tick or untick one month's bill as paid (or pot as topped up). */
export async function setDone(
  db: RunwayDB,
  id: string,
  month: MonthKey,
  done: boolean,
): Promise<void> {
  const key = occurrenceKey(id, month)
  if (done) await db.done.put({ key, doneAt: new Date().toISOString() })
  else await db.done.delete(key)
}

// --- Food -------------------------------------------------------------------

export async function addFoodSpend(
  db: RunwayDB,
  date: ISODate,
  amount: Pence,
  note?: string,
): Promise<number> {
  assertISODate(date)
  assertPence(amount, 'food spend')
  if (amount <= 0) throw new RangeError('Food spend must be more than £0')
  const trimmed = note?.trim()
  const id = await db.foodSpends.add({ date, amount, ...(trimmed ? { note: trimmed } : {}) })
  return id as number
}

export async function deleteFoodSpend(db: RunwayDB, id: number): Promise<void> {
  await db.foodSpends.delete(id)
}

// --- Payday and bank holidays -----------------------------------------------

export async function setPaydayOverride(
  db: RunwayDB,
  month: MonthKey,
  date: ISODate | null,
): Promise<void> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new RangeError(`Expected a month like 2026-12`)
  if (date === null) {
    await db.paydayOverrides.delete(month)
    return
  }
  assertISODate(date)
  await db.paydayOverrides.put({ month, date })
}

/** Mark a date as a bank holiday ('add'), not one ('remove'), or back to the bundled list (null). */
export async function setBankHolidayEdit(
  db: RunwayDB,
  date: ISODate,
  action: 'add' | 'remove' | null,
): Promise<void> {
  assertISODate(date)
  if (action === null) await db.bankHolidayEdits.delete(date)
  else await db.bankHolidayEdits.put({ date, action })
}

export async function bankHolidays(db: RunwayDB): Promise<ISODate[]> {
  const edits = await db.bankHolidayEdits.toArray()
  return applyBankHolidayEdits(
    ENGLAND_AND_WALES_BANK_HOLIDAYS,
    edits.filter((e) => e.action === 'add').map((e) => e.date),
    edits.filter((e) => e.action === 'remove').map((e) => e.date),
  )
}

// --- Bridge to the money maths ----------------------------------------------

/**
 * Everything safeToday() needs, read in one consistent snapshot.
 * Returns null until setup is done (no settings or no balance yet).
 */
export async function loadSafeTodayInput(
  db: RunwayDB,
  today: ISODate,
): Promise<SafeTodayInput | null> {
  assertISODate(today)
  return db.transaction(
    'r',
    [
      db.settings,
      db.balance,
      db.bills,
      db.pots,
      db.done,
      db.foodSpends,
      db.paydayOverrides,
      db.bankHolidayEdits,
    ],
    async () => {
      const [settings, balance, bills, pots, done, spends, overrides, holidays] = await Promise.all(
        [
          getSettings(db),
          latestBalance(db),
          db.bills.toArray(),
          db.pots.toArray(),
          db.done.toArray(),
          db.foodSpends.toArray(),
          db.paydayOverrides.toArray(),
          bankHolidays(db),
        ],
      )
      if (!settings || !balance) return null

      const toItem = ({ id, amount, dayOfMonth }: MonthlyEntry) => ({ id, amount, dayOfMonth })
      return {
        today,
        balance: balance.amount,
        bills: bills.filter((b) => b.active).map(toItem),
        pots: pots.filter((p) => p.active).map(toItem),
        done: new Set(done.map((d) => d.key)),
        buffer: settings.buffer,
        food: {
          weeklyFloor: settings.weeklyFoodFloor,
          trackingStart: settings.foodTrackingStart,
          spends: spends.map(({ date, amount }) => ({ date, amount })),
        },
        plannedDailySpend: settings.plannedDailySpend,
        bankHolidays: holidays,
        paydayOverrides: Object.fromEntries(overrides.map((o) => [o.month, o.date])),
      }
    },
  )
}
