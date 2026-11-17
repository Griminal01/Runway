import { applyBankHolidayEdits, ENGLAND_AND_WALES_BANK_HOLIDAYS } from './bankHolidays'
import type { BalanceEntry, MonthlyEntry, RunwayDB, Settings } from './db'
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

function isManual(entry: BalanceEntry): boolean {
  return entry.source === undefined || entry.source === 'manual'
}

/**
 * Move the balance by `delta` as an estimate (a logged food spend or extra income).
 * Returns the timestamp used, or undefined when there's no balance yet to adjust.
 */
async function adjustBalance(
  db: RunwayDB,
  delta: Pence,
  source: 'food' | 'income',
  at: Date,
): Promise<string | undefined> {
  const balance = await latestBalance(db)
  if (!balance) return undefined
  const enteredAt = at.toISOString()
  await db.balance.add({ amount: balance.amount + delta, enteredAt, source })
  return enteredAt
}

/**
 * Undo an earlier adjustment, unless the balance has been typed in since: that manual figure
 * already reflects reality.
 */
async function undoAdjustment(
  db: RunwayDB,
  adjustedAt: string | undefined,
  delta: Pence,
  source: 'food' | 'income',
  at: Date,
): Promise<void> {
  if (!adjustedAt) return
  const later = await db.balance.where('enteredAt').above(adjustedAt).toArray()
  if (later.some(isManual)) return
  await adjustBalance(db, -delta, source, at)
}

export async function setBalance(db: RunwayDB, amount: Pence, at = new Date()): Promise<void> {
  assertPence(amount, 'balance') // may be negative (overdraft)
  await db.balance.add({ amount, enteredAt: at.toISOString(), source: 'manual' })
}

export async function latestBalance(
  db: RunwayDB,
): Promise<{ amount: Pence; enteredAt: string; estimated: boolean } | undefined> {
  const entry = await db.balance.orderBy('enteredAt').last()
  return (
    entry && {
      amount: entry.amount,
      enteredAt: entry.enteredAt,
      estimated: !isManual(entry),
    }
  )
}

// --- Bills and pots ---------------------------------------------------------

type MonthlyTable = 'bills' | 'pots'
export type MonthlyInput = Omit<MonthlyEntry, 'id' | 'active'> & { active?: boolean }

function checkMonthly(input: MonthlyInput): MonthlyInput {
  assertPence(input.amount, `amount for ${input.name}`)
  if (input.amount < 0) throw new RangeError('Amount cannot be negative')
  const { endDate, ...rest } = input
  if (endDate !== undefined) assertISODate(endDate)
  return {
    ...rest,
    name: checkName(input.name),
    dayOfMonth: checkDayOfMonth(input.dayOfMonth),
    ...(endDate !== undefined ? { endDate } : {}),
  }
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
  // Start without the old end date, so saving without one clears it.
  const base: MonthlyEntry = { ...existing }
  delete base.endDate
  await db[table].put({ ...base, ...checkMonthly(input), id })
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

/**
 * Log food spending. It has just left the account, so the balance drops by the same amount
 * (when there is a balance). The next manual balance update replaces this estimate.
 */
export async function addFoodSpend(
  db: RunwayDB,
  date: ISODate,
  amount: Pence,
  note?: string,
  at = new Date(),
): Promise<number> {
  assertISODate(date)
  assertPence(amount, 'food spend')
  if (amount <= 0) throw new RangeError('Food spend must be more than £0')
  const trimmed = note?.trim()
  return db.transaction('rw', db.foodSpends, db.balance, async () => {
    const adjustedAt = await adjustBalance(db, -amount, 'food', at)
    const id = await db.foodSpends.add({
      date,
      amount,
      ...(trimmed ? { note: trimmed } : {}),
      ...(adjustedAt ? { balanceAdjustedAt: adjustedAt } : {}),
    })
    return id as number
  })
}

/**
 * Remove a food spend logged by mistake. Its amount goes back on the balance, unless a
 * manual balance update has happened since (that update already shows the real figure).
 */
export async function deleteFoodSpend(db: RunwayDB, id: number, at = new Date()): Promise<void> {
  await db.transaction('rw', db.foodSpends, db.balance, async () => {
    const spend = await db.foodSpends.get(id)
    if (!spend) return
    await db.foodSpends.delete(id)
    await undoAdjustment(db, spend.balanceAdjustedAt, -spend.amount, 'food', at)
  })
}

// --- Extra income -----------------------------------------------------------

/**
 * Log money in apart from salary (selling something, a refund, a gift). It has just arrived,
 * so the balance rises by the same amount until the next manual balance update.
 */
export async function addIncome(
  db: RunwayDB,
  date: ISODate,
  amount: Pence,
  note?: string,
  at = new Date(),
): Promise<number> {
  assertISODate(date)
  assertPence(amount, 'income')
  if (amount <= 0) throw new RangeError('Income must be more than £0')
  const trimmed = note?.trim()
  return db.transaction('rw', db.income, db.balance, async () => {
    const adjustedAt = await adjustBalance(db, amount, 'income', at)
    const id = await db.income.add({
      date,
      amount,
      ...(trimmed ? { note: trimmed } : {}),
      ...(adjustedAt ? { balanceAdjustedAt: adjustedAt } : {}),
    })
    return id as number
  })
}

/** Remove income logged by mistake. It comes back off the balance, unless typed in since. */
export async function deleteIncome(db: RunwayDB, id: number, at = new Date()): Promise<void> {
  await db.transaction('rw', db.income, db.balance, async () => {
    const entry = await db.income.get(id)
    if (!entry) return
    await db.income.delete(id)
    await undoAdjustment(db, entry.balanceAdjustedAt, entry.amount, 'income', at)
  })
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

      const toItem = ({ id, amount, dayOfMonth, endDate }: MonthlyEntry) => ({
        id,
        amount,
        dayOfMonth,
        ...(endDate !== undefined ? { endDate } : {}),
      })
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
