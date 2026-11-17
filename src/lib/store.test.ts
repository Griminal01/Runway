import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RunwayDB } from './db'
import { localToday, requestPersistentStorage } from './device'
import { occurrenceKey, safeToday } from './money'
import {
  addFoodSpend,
  addMonthly,
  bankHolidays,
  deleteFoodSpend,
  deleteMonthly,
  latestBalance,
  loadSafeTodayInput,
  saveSettings,
  setBalance,
  setBankHolidayEdit,
  setDone,
  setPaydayOverride,
  updateMonthly,
} from './store'

let db: RunwayDB
let n = 0

beforeEach(() => {
  db = new RunwayDB(`runway-test-${n++}`)
})

afterEach(async () => {
  await db.delete()
})

const settings = {
  buffer: 10000,
  weeklyFoodFloor: 5000,
  plannedDailySpend: 1500,
  foodTrackingStart: '2026-11-16',
}

describe('settings', () => {
  it('saves and validates', async () => {
    await saveSettings(db, settings)
    expect(await db.settings.get('main')).toEqual({ id: 'main', ...settings })
    await expect(saveSettings(db, { ...settings, buffer: 10.5 })).rejects.toThrow(RangeError)
    await expect(saveSettings(db, { ...settings, buffer: -1 })).rejects.toThrow(RangeError)
    await expect(
      saveSettings(db, { ...settings, foodTrackingStart: '2026-02-30' }),
    ).rejects.toThrow(RangeError)
  })
})

describe('balance', () => {
  it('uses the latest entry and allows overdraft', async () => {
    await setBalance(db, 50000, new Date('2026-11-16T09:00:00Z'))
    await setBalance(db, -2500, new Date('2026-11-17T09:00:00Z'))
    expect((await latestBalance(db))?.amount).toBe(-2500)
  })

  it('rejects fractional pence', async () => {
    await expect(setBalance(db, 0.1)).rejects.toThrow(RangeError)
  })
})

describe('bills and pots', () => {
  it('adds, updates and validates', async () => {
    const id = await addMonthly(db, 'bills', { name: ' Phone ', amount: 1500, dayOfMonth: 20 })
    expect(await db.bills.get(id)).toMatchObject({ name: 'Phone', active: true })
    await updateMonthly(db, 'bills', id, {
      name: 'Phone',
      amount: 1600,
      dayOfMonth: 20,
      active: false,
    })
    expect(await db.bills.get(id)).toMatchObject({ amount: 1600, active: false })
    await expect(addMonthly(db, 'bills', { name: '', amount: 1, dayOfMonth: 1 })).rejects.toThrow()
    await expect(
      addMonthly(db, 'bills', { name: 'x', amount: 1, dayOfMonth: 32 }),
    ).rejects.toThrow()
    await expect(
      addMonthly(db, 'pots', { name: 'x', amount: 1.5, dayOfMonth: 1 }),
    ).rejects.toThrow()
  })

  it('ticks a month done, and deleting a bill clears its ticks', async () => {
    const id = await addMonthly(db, 'bills', { name: 'Phone', amount: 1500, dayOfMonth: 20 })
    await setDone(db, id, '2026-11', true)
    expect(await db.done.get(occurrenceKey(id, '2026-11'))).toBeDefined()
    await setDone(db, id, '2026-11', false)
    expect(await db.done.count()).toBe(0)

    await setDone(db, id, '2026-11', true)
    await deleteMonthly(db, 'bills', id)
    expect(await db.bills.count()).toBe(0)
    expect(await db.done.count()).toBe(0)
  })
})

describe('food spends', () => {
  it('stores spends and rejects zero or bad dates', async () => {
    await addFoodSpend(db, '2026-11-16', 1234, '  Aldi ')
    expect((await db.foodSpends.toArray())[0]).toMatchObject({ amount: 1234, note: 'Aldi' })
    await expect(addFoodSpend(db, '2026-11-16', 0)).rejects.toThrow(RangeError)
    await expect(addFoodSpend(db, '16/11/2026', 100)).rejects.toThrow(RangeError)
  })
})

describe('food spends and the balance', () => {
  const t = (iso: string) => new Date(iso)

  it('logging a spend lowers the balance, marked as an estimate', async () => {
    await setBalance(db, 80000, t('2026-11-17T09:00:00Z'))
    await addFoodSpend(db, '2026-11-17', 6240, 'Big shop', t('2026-11-17T10:00:00Z'))
    expect(await latestBalance(db)).toMatchObject({ amount: 73760, estimated: true })
  })

  it('a manual update replaces the estimate', async () => {
    await setBalance(db, 80000, t('2026-11-17T09:00:00Z'))
    await addFoodSpend(db, '2026-11-17', 6240, undefined, t('2026-11-17T10:00:00Z'))
    await setBalance(db, 74000, t('2026-11-17T11:00:00Z'))
    expect(await latestBalance(db)).toMatchObject({ amount: 74000, estimated: false })
  })

  it('logging a food spend lowers Safe today by the overspend only', async () => {
    await saveSettings(db, settings)
    await setBalance(db, 80000, t('2026-11-17T09:00:00Z'))
    const before = safeToday((await loadSafeTodayInput(db, '2026-11-17'))!)
    await addFoodSpend(db, '2026-11-17', 3000, undefined, t('2026-11-17T10:00:00Z'))
    const within = safeToday((await loadSafeTodayInput(db, '2026-11-17'))!)
    expect(within.spare).toBe(before.spare) // within the floor: Safe today unchanged
    await addFoodSpend(db, '2026-11-17', 3000, undefined, t('2026-11-17T11:00:00Z'))
    const over = safeToday((await loadSafeTodayInput(db, '2026-11-17'))!)
    expect(over.spare).toBe(before.spare - 1000) // 1000 over the 5000 floor
  })

  it('deleting a spend puts the money back', async () => {
    await setBalance(db, 80000, t('2026-11-17T09:00:00Z'))
    const id = await addFoodSpend(db, '2026-11-17', 6240, undefined, t('2026-11-17T10:00:00Z'))
    await deleteFoodSpend(db, id, t('2026-11-17T10:05:00Z'))
    expect(await db.foodSpends.count()).toBe(0)
    expect((await latestBalance(db))?.amount).toBe(80000)
  })

  it('deleting does not touch a balance typed in since', async () => {
    await setBalance(db, 80000, t('2026-11-17T09:00:00Z'))
    const id = await addFoodSpend(db, '2026-11-17', 6240, undefined, t('2026-11-17T10:00:00Z'))
    await setBalance(db, 73760, t('2026-11-17T11:00:00Z'))
    await deleteFoodSpend(db, id, t('2026-11-17T12:00:00Z'))
    expect((await latestBalance(db))?.amount).toBe(73760)
  })

  it('logs without a balance yet', async () => {
    await addFoodSpend(db, '2026-11-17', 100)
    expect(await db.balance.count()).toBe(0)
  })
})

describe('payday overrides and bank holidays', () => {
  it('sets and clears overrides', async () => {
    await setPaydayOverride(db, '2026-12', '2026-12-23')
    expect(await db.paydayOverrides.get('2026-12')).toEqual({
      month: '2026-12',
      date: '2026-12-23',
    })
    await setPaydayOverride(db, '2026-12', null)
    expect(await db.paydayOverrides.count()).toBe(0)
    await expect(setPaydayOverride(db, 'Dec', '2026-12-23')).rejects.toThrow(RangeError)
  })

  it('applies holiday edits on top of the bundled list', async () => {
    await setBankHolidayEdit(db, '2026-08-31', 'remove')
    await setBankHolidayEdit(db, '2026-06-15', 'add')
    const list = await bankHolidays(db)
    expect(list).not.toContain('2026-08-31')
    expect(list).toContain('2026-06-15')
    await setBankHolidayEdit(db, '2026-08-31', null)
    expect(await bankHolidays(db)).toContain('2026-08-31')
  })
})

describe('loadSafeTodayInput', () => {
  it('returns null until settings and balance exist', async () => {
    expect(await loadSafeTodayInput(db, '2026-11-17')).toBeNull()
    await saveSettings(db, settings)
    expect(await loadSafeTodayInput(db, '2026-11-17')).toBeNull()
  })

  it('feeds safeToday from stored data', async () => {
    await saveSettings(db, settings)
    await setBalance(db, 80000)
    const phone = await addMonthly(db, 'bills', { name: 'Phone', amount: 1500, dayOfMonth: 20 })
    await addMonthly(db, 'bills', { name: 'Old gym', amount: 9999, dayOfMonth: 21, active: false })
    await addMonthly(db, 'pots', { name: 'Car', amount: 5000, dayOfMonth: 25 })

    const input = await loadSafeTodayInput(db, '2026-11-17')
    expect(input).not.toBeNull()
    const r = safeToday(input!)
    expect(r.payday).toBe('2026-11-27')
    expect(r.billsTotal).toBe(1500) // inactive bill ignored
    expect(r.perDay).toBe(5350) // same scenario as money.test.ts

    await setDone(db, phone, '2026-11', true)
    expect(safeToday((await loadSafeTodayInput(db, '2026-11-17'))!).billsTotal).toBe(0)
  })

  it('applies overrides and food spends', async () => {
    await saveSettings(db, settings)
    await setBalance(db, 80000)
    await setPaydayOverride(db, '2026-11', '2026-11-20')
    await addFoodSpend(db, '2026-11-16', 2000)
    const r = safeToday((await loadSafeTodayInput(db, '2026-11-17'))!)
    expect(r.payday).toBe('2026-11-20')
    expect(r.foodRemaining).toBe(3000)
  })
})

describe('device helpers', () => {
  it('gives local today', () => {
    expect(localToday(new Date(2026, 10, 17, 23, 30))).toBe('2026-11-17')
    expect(localToday(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
  })

  it('requests persistent storage', async () => {
    expect(await requestPersistentStorage(undefined)).toBe('unsupported')
    const already = { persisted: async () => true, persist: async () => false }
    expect(await requestPersistentStorage(already)).toBe('granted')
    const asks = { persisted: async () => false, persist: async () => true }
    expect(await requestPersistentStorage(asks)).toBe('granted')
    const refuses = { persisted: async () => false, persist: async () => false }
    expect(await requestPersistentStorage(refuses)).toBe('denied')
    const throws = {
      persisted: async () => {
        throw new Error('nope')
      },
      persist: async () => true,
    }
    expect(await requestPersistentStorage(throws)).toBe('denied')
  })
})
