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
  /** When a backup file was last saved, ISO timestamp. */
  lastBackupAt?: string
}

export interface BalanceEntry {
  id?: number
  amount: Pence
  /** When it was entered, ISO timestamp. The latest one is the current balance. */
  enteredAt: string
  /**
   * 'manual' (typed in, the default), or an estimate adjusted by logging or removing a
   * food spend ('food') or extra income ('income').
   */
  source?: 'manual' | 'food' | 'income'
}

/** A bill or a pot top-up: same amount on the same day each month. */
export interface MonthlyEntry {
  id: string
  name: string
  amount: Pence
  /** 1-31. Shorter months use their last day. */
  dayOfMonth: number
  active: boolean
  /** Date of the final payment, if it stops. */
  endDate?: ISODate
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
  /** When logging this spend lowered the balance. Lets a deletion put it back. */
  balanceAdjustedAt?: string
}

/** Money in apart from salary, e.g. selling something. */
export interface IncomeEntry {
  id?: number
  date: ISODate
  amount: Pence
  note?: string
  /** When logging this raised the balance. Lets a deletion take it back off. */
  balanceAdjustedAt?: string
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
  income!: EntityTable<IncomeEntry, 'id'>

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
    // v2: extra income. Earlier tables carry over unchanged.
    this.version(2).stores({
      income: '++id, date',
    })
  }
}

export const db = new RunwayDB()
