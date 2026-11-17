import Dexie, { type EntityTable } from 'dexie'
import type { ISODate, MonthKey, Pence } from './money'

/**
 * Everything Runway stores, kept only in this device's IndexedDB.
 * Change the schema by adding a new db.version(n) block below. Never edit an old one:
 * that is what lets existing data upgrade instead of being wiped.
 */

export interface Settings {
  id: 'main'
  buffer: Pence
  weeklyFoodFloor: Pence
  plannedDailySpend: Pence
  /** First day food spends count from. */
  foodTrackingStart: ISODate
}

export interface BalanceEntry {
  id?: number
  amount: Pence
  /** When it was entered, ISO timestamp. The latest one is the current balance. */
  enteredAt: string
}

/** A bill or a pot top-up: same amount on the same day each month. */
export interface MonthlyEntry {
  id: string
  name: string
  amount: Pence
  /** 1-31. Shorter months use their last day. */
  dayOfMonth: number
  active: boolean
}

/** One month's bill marked paid, or pot topped up. Key from occurrenceKey(). */
export interface DoneEntry {
  key: string
  doneAt: string
}

export interface FoodSpendEntry {
  id?: number
  date: ISODate
  amount: Pence
  note?: string
}

export interface PaydayOverride {
  month: MonthKey
  date: ISODate
}

export interface BankHolidayEdit {
  date: ISODate
  action: 'add' | 'remove'
}

export class RunwayDB extends Dexie {
  settings!: EntityTable<Settings, 'id'>
  balance!: EntityTable<BalanceEntry, 'id'>
  bills!: EntityTable<MonthlyEntry, 'id'>
  pots!: EntityTable<MonthlyEntry, 'id'>
  done!: EntityTable<DoneEntry, 'key'>
  foodSpends!: EntityTable<FoodSpendEntry, 'id'>
  paydayOverrides!: EntityTable<PaydayOverride, 'month'>
  bankHolidayEdits!: EntityTable<BankHolidayEdit, 'date'>

  constructor(name = 'runway') {
    super(name)
    this.version(1).stores({
      settings: 'id',
      balance: '++id, enteredAt',
      bills: 'id',
      pots: 'id',
      done: 'key',
      foodSpends: '++id, date',
      paydayOverrides: 'month',
      bankHolidayEdits: 'date',
    })
  }
}

export const db = new RunwayDB()
