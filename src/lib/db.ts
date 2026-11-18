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
   * food spend ('food'), extra income ('income') or an extra debt payment ('debt').
   */
  source?: 'manual' | 'food' | 'income' | 'debt'
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

/** A debt being paid off, e.g. PayPal Credit. */
export interface Debt {
  id: string
  name: string
  /** What's owed, as last typed in from the lender's app. */
  balance: Pence
  /** When `balance` was typed in, ISO timestamp. */
  balanceUpdatedAt: string
  /** The balance when first added, for the progress bar. */
  startBalance: Pence
  /** APR in basis points (23.9% = 2390). */
  aprBp: number
  /** The regular monthly payment. Counted in Safe today like a bill. */
  monthlyPayment: Pence
  dayOfMonth: number
  /** End of a 0% offer, if any. */
  interestFreeUntil?: ISODate
  active: boolean
}

/** A one-off payment on top of the regular one. */
export interface DebtPayment {
  id?: number
  debtId: string
  date: ISODate
  amount: Pence
  loggedAt: string
  /** When logging this lowered the bank balance. Lets a deletion put it back. */
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
  debts!: EntityTable<Debt, 'id'>
  debtPayments!: EntityTable<DebtPayment, 'id'>

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
    // v3: debts and extra debt payments.
    this.version(3).stores({
      debts: 'id',
      debtPayments: '++id, debtId, date',
    })
  }
}

export const db = new RunwayDB()
