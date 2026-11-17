import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  backupFileName,
  backupReminder,
  exportBackup,
  markBackedUp,
  parseBackup,
  restoreBackup,
  summarise,
} from './backup'
import { RunwayDB } from './db'
import { safeToday } from './money'
import {
  addFoodSpend,
  addIncome,
  addMonthly,
  loadSafeTodayInput,
  saveSettings,
  setBalance,
  setBankHolidayEdit,
  setDone,
  setPaydayOverride,
} from './store'

let db: RunwayDB
let other: RunwayDB
let n = 0

beforeEach(() => {
  db = new RunwayDB(`backup-test-${n++}`)
  other = new RunwayDB(`backup-test-${n++}`)
})

afterEach(async () => {
  await db.delete()
  await other.delete()
})

const settings = {
  buffer: 10000,
  weeklyFoodFloor: 5000,
  plannedDailySpend: 1500,
  foodTrackingStart: '2026-11-16',
}

async function seed(target: RunwayDB) {
  await saveSettings(target, settings)
  await setBalance(target, 80000, new Date('2026-11-17T09:00:00Z'))
  const phone = await addMonthly(target, 'bills', { name: 'Phone', amount: 1500, dayOfMonth: 20 })
  await addMonthly(target, 'pots', { name: 'Car fund', amount: 5000, dayOfMonth: 25 })
  await setDone(target, phone, '2026-12', true)
  await addFoodSpend(target, '2026-11-16', 2340, 'Aldi', new Date('2026-11-17T10:00:00Z'))
  await setPaydayOverride(target, '2026-12', '2026-12-23')
  await setBankHolidayEdit(target, '2026-08-31', 'remove')
  await addIncome(target, '2026-11-17', 4000, 'Sold bike parts', new Date('2026-11-17T11:00:00Z'))
  await addMonthly(target, 'bills', {
    name: 'Phone contract',
    amount: 2500,
    dayOfMonth: 22,
    endDate: '2027-03-22',
  })
}

async function roundTrip(json: string) {
  const parsed = parseBackup(json)
  if (!parsed.ok) throw new Error(parsed.error)
  await restoreBackup(other, parsed.backup)
}

describe('backup round trip', () => {
  it('restores everything so Safe today is identical', async () => {
    await seed(db)
    const json = JSON.stringify(await exportBackup(db))
    await roundTrip(json)

    const a = safeToday((await loadSafeTodayInput(db, '2026-11-17'))!)
    const b = safeToday((await loadSafeTodayInput(other, '2026-11-17'))!)
    expect(b).toEqual(a)
    expect(await other.done.count()).toBe(1)
    expect((await other.income.toArray())[0]).toMatchObject({
      amount: 4000,
      note: 'Sold bike parts',
    })
    expect((await other.bills.toArray()).find((b) => b.name === 'Phone contract')?.endDate).toBe(
      '2027-03-22',
    )
    expect(await other.paydayOverrides.get('2026-12')).toBeDefined()
    expect(await other.bankHolidayEdits.get('2026-08-31')).toEqual({
      date: '2026-08-31',
      action: 'remove',
    })
    expect((await other.foodSpends.toArray())[0]).toMatchObject({ note: 'Aldi', amount: 2340 })
  })

  it('replaces existing data rather than merging', async () => {
    await seed(db)
    await saveSettings(other, { ...settings, buffer: 99 })
    await addMonthly(other, 'bills', { name: 'Stray', amount: 1, dayOfMonth: 1 })
    await roundTrip(JSON.stringify(await exportBackup(db)))
    expect((await other.bills.toArray()).map((b) => b.name).sort()).toEqual([
      'Phone',
      'Phone contract',
    ])
    expect((await other.settings.get('main'))?.buffer).toBe(10000)
  })

  it('summarises a backup', async () => {
    await seed(db)
    const backup = await exportBackup(db, new Date('2026-11-17T12:00:00Z'))
    expect(summarise(backup)).toEqual({
      exportedAt: '2026-11-17T12:00:00.000Z',
      balance: 80000 - 2340 + 4000, // after the food spend and income adjusted it
      bills: 2,
      pots: 1,
      foodSpends: 1,
      income: 1,
    })
  })

  it('names files by date, matching the .gitignore pattern', () => {
    expect(backupFileName('2026-11-17')).toBe('runway-backup-2026-11-17.json')
  })
})

describe('parseBackup refuses bad files', () => {
  async function validJson() {
    await seed(db)
    return JSON.parse(JSON.stringify(await exportBackup(db)))
  }

  it.each([
    ['not JSON', () => 'hello', 'isn’t a Runway backup'],
    ['another app', () => '{"app":"other"}', 'isn’t a Runway backup'],
    ['a newer format', () => '{"app":"runway","format":2}', 'newer version'],
  ])('%s', (_, make, message) => {
    const result = parseBackup(make())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(message)
  })

  it('fractional pence', async () => {
    const raw = await validJson()
    raw.data.bills[0].amount = 15.5
    const result = parseBackup(JSON.stringify(raw))
    expect(result).toEqual({ ok: false, error: 'bill amount isn’t a whole number of pence' })
  })

  it('impossible dates', async () => {
    const raw = await validJson()
    raw.data.foodSpends[0].date = '2026-02-30'
    expect(parseBackup(JSON.stringify(raw)).ok).toBe(false)
  })

  it('missing tables', async () => {
    const raw = await validJson()
    delete raw.data.pots
    expect(parseBackup(JSON.stringify(raw))).toEqual({ ok: false, error: 'Missing pots' })
  })

  it('a bad file leaves existing data untouched', async () => {
    await seed(other)
    const raw = await validJson()
    raw.data.balance[0].amount = 'lots'
    const result = parseBackup(JSON.stringify(raw))
    expect(result.ok).toBe(false)
    expect(await other.bills.count()).toBe(2)
  })

  it('allows a negative balance (overdraft)', async () => {
    const raw = await validJson()
    raw.data.balance[0].amount = -2500
    expect(parseBackup(JSON.stringify(raw)).ok).toBe(true)
  })
})

describe('backup reminder', () => {
  const base = { id: 'main' as const, ...settings }

  it('waits a week after setup before the first reminder', () => {
    expect(backupReminder(base, new Date('2026-11-20T12:00:00'))).toBeNull()
    expect(backupReminder(base, new Date('2026-11-23T12:00:00'))).toBe('never')
  })

  it('reminds after 30 days', () => {
    const s = { ...base, lastBackupAt: '2026-11-01T12:00:00.000Z' }
    expect(backupReminder(s, new Date('2026-11-30T12:00:00Z'))).toBeNull()
    expect(backupReminder(s, new Date('2026-12-01T12:00:00Z'))).toBe(30)
  })

  it('markBackedUp records the time', async () => {
    await saveSettings(db, settings)
    await markBackedUp(db, new Date('2026-11-17T12:00:00Z'))
    expect((await db.settings.get('main'))?.lastBackupAt).toBe('2026-11-17T12:00:00.000Z')
  })
})

describe('older backups', () => {
  it('restore without an income table', async () => {
    await seed(db)
    const raw = JSON.parse(JSON.stringify(await exportBackup(db)))
    delete raw.data.income
    const parsed = parseBackup(JSON.stringify(raw))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.backup.data.income).toEqual([])
  })

  it('refuse an invalid end date', async () => {
    await seed(db)
    const raw = JSON.parse(JSON.stringify(await exportBackup(db)))
    raw.data.bills[0].endDate = '2027-02-30'
    expect(parseBackup(JSON.stringify(raw)).ok).toBe(false)
  })
})
