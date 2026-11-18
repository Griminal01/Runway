/**
 * All of Runway's money maths. Pure functions only:
 * - every amount is integer pence
 * - every date is an ISO 'YYYY-MM-DD' string (a calendar day, no time zone)
 * - "today" is always passed in, never read from the clock
 *
 * The rules implemented here are the ones in CLAUDE.md. Change them there first.
 */

export type Pence = number
/** Calendar date, 'YYYY-MM-DD'. */
export type ISODate = string
/** Calendar month, 'YYYY-MM'. */
export type MonthKey = string

// ---------------------------------------------------------------------------
// Pence
// ---------------------------------------------------------------------------

export function assertPence(value: number, label = 'amount'): Pence {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a whole number of pence, got ${value}`)
  }
  return value
}

/** 123456 -> '£1,234.56'; -1230 -> '-£12.30'. */
export function formatGBP(pence: Pence): string {
  assertPence(pence)
  const sign = pence < 0 ? '-' : ''
  const abs = Math.abs(pence)
  const pounds = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const p = String(abs % 100).padStart(2, '0')
  return `${sign}£${pounds}.${p}`
}

/**
 * Parse what someone types into a money field. Accepts '12', '12.3', '£1,234.56', '-5.00'.
 * Returns null for anything that isn't a clear amount (including more than 2 decimal places).
 * Never goes through floating point.
 */
export function parseGBP(input: string): Pence | null {
  const cleaned = input.trim().replace(/[£,\s]/g, '')
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  const [, minus, whole, frac = ''] = match
  const pence = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  if (!Number.isSafeInteger(pence)) return null
  return minus && pence !== 0 ? -pence : pence
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000

function parseISO(date: ISODate): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new RangeError(`Expected a date like 2026-08-27, got '${date}'`)
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) {
    throw new RangeError(`Not a real date: '${date}'`)
  }
  return [y, m, d]
}

/** Throws unless the string is a real calendar date like '2026-08-27'. */
export function assertISODate(date: ISODate): ISODate {
  parseISO(date)
  return date
}

function toDayNumber(date: ISODate): number {
  const [y, m, d] = parseISO(date)
  return Date.UTC(y, m - 1, d) / MS_PER_DAY
}

function fromDayNumber(n: number): ISODate {
  const dt = new Date(n * MS_PER_DAY)
  return makeDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

function makeDate(year: number, month: number, day: number): ISODate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(date) + days)
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: ISODate, to: ISODate): number {
  return toDayNumber(to) - toDayNumber(from)
}

/** 1 = Monday ... 7 = Sunday (ISO weekday). */
export function isoWeekday(date: ISODate): number {
  // Day 0 (1970-01-01) was a Thursday.
  const n = toDayNumber(date)
  return ((((n + 3) % 7) + 7) % 7) + 1
}

export function monthKey(date: ISODate): MonthKey {
  return date.slice(0, 7)
}

function nextMonth(year: number, month: number): [number, number] {
  return month === 12 ? [year + 1, 1] : [year, month + 1]
}

// ---------------------------------------------------------------------------
// Payday
// ---------------------------------------------------------------------------

/** Monday to Friday, and not a bank holiday. */
export function isWorkingDay(date: ISODate, bankHolidays: readonly ISODate[]): boolean {
  return isoWeekday(date) <= 5 && !bankHolidays.includes(date)
}

/** The penultimate working day of the month. */
export function defaultPayday(
  year: number,
  month: number,
  bankHolidays: readonly ISODate[],
): ISODate {
  let found = 0
  for (let day = daysInMonth(year, month); day >= 1; day--) {
    const date = makeDate(year, month, day)
    if (isWorkingDay(date, bankHolidays)) {
      found++
      if (found === 2) return date
    }
  }
  throw new Error(`No penultimate working day in ${year}-${month}`)
}

/** A manual override for the month wins over the calculated date. */
export function effectivePayday(
  year: number,
  month: number,
  bankHolidays: readonly ISODate[],
  overrides: Readonly<Record<MonthKey, ISODate>>,
): ISODate {
  const key = makeDate(year, month, 1).slice(0, 7)
  const override = overrides[key]
  if (override !== undefined) {
    parseISO(override)
    return override
  }
  return defaultPayday(year, month, bankHolidays)
}

/**
 * The next payday strictly after today. On payday itself the period has rolled
 * over, so this returns the following month's payday.
 */
export function nextPayday(
  today: ISODate,
  bankHolidays: readonly ISODate[],
  overrides: Readonly<Record<MonthKey, ISODate>>,
): ISODate {
  let [year, month] = parseISO(today)
  // Look a few months ahead in case overrides move paydays oddly.
  for (let i = 0; i < 3; i++) {
    const payday = effectivePayday(year, month, bankHolidays, overrides)
    if (payday > today) return payday
    ;[year, month] = nextMonth(year, month)
  }
  throw new Error(`Could not find a payday after ${today}`)
}

/** Counts today but not payday itself, so it is never less than 1. */
export function daysUntilPayday(today: ISODate, payday: ISODate): number {
  return Math.max(1, daysBetween(today, payday))
}

// ---------------------------------------------------------------------------
// Bills and pot top-ups
// ---------------------------------------------------------------------------

/** Something that happens on the same day each month: a bill or a pot top-up. */
export interface MonthlyItem {
  id: string
  amount: Pence
  /** 1-31. Months without that day use their last day. */
  dayOfMonth: number
  /** Date of the final payment, if it stops. Nothing after it counts. */
  endDate?: ISODate
}

/** Key used to mark one month's occurrence as done (bill paid, pot topped up). */
export function occurrenceKey(id: string, month: MonthKey): string {
  return `${id}@${month}`
}

export function dueDateInMonth(dayOfMonth: number, year: number, month: number): ISODate {
  return makeDate(year, month, Math.min(dayOfMonth, daysInMonth(year, month)))
}

/** The next date this monthly item falls on, today or later. */
export function nextOccurrence(dayOfMonth: number, today: ISODate): ISODate {
  const [year, month] = parseISO(today)
  const thisMonth = dueDateInMonth(dayOfMonth, year, month)
  if (thisMonth >= today) return thisMonth
  const [ny, nm] = nextMonth(year, month)
  return dueDateInMonth(dayOfMonth, ny, nm)
}

/** True once the final payment of an item with an end date is in the past. */
export function hasEnded(
  item: Pick<MonthlyItem, 'dayOfMonth' | 'endDate'>,
  today: ISODate,
): boolean {
  return item.endDate !== undefined && nextOccurrence(item.dayOfMonth, today) > item.endDate
}

/** The next n paydays from today, with whether each one is a manual override. */
export function upcomingPaydays(
  today: ISODate,
  count: number,
  bankHolidays: readonly ISODate[],
  overrides: Readonly<Record<MonthKey, ISODate>>,
): { month: MonthKey; date: ISODate; calculated: ISODate; overridden: boolean }[] {
  let [year, month] = parseISO(nextPayday(today, bankHolidays, overrides))
  const result = []
  for (let i = 0; i < count; i++) {
    const key = makeDate(year, month, 1).slice(0, 7)
    const calculated = defaultPayday(year, month, bankHolidays)
    const date = effectivePayday(year, month, bankHolidays, overrides)
    result.push({ month: key, date, calculated, overridden: key in overrides })
    ;[year, month] = nextMonth(year, month)
  }
  return result
}

export interface DueOccurrence {
  id: string
  amount: Pence
  dueDate: ISODate
}

/**
 * Occurrences due from today up to the day before payday that are not yet done.
 * Anything whose due date has already passed is treated as having left the account.
 */
export function dueBeforePayday(
  items: readonly MonthlyItem[],
  today: ISODate,
  payday: ISODate,
  done: ReadonlySet<string>,
): DueOccurrence[] {
  const result: DueOccurrence[] = []
  let [year, month] = parseISO(today)
  const lastKey = monthKey(payday)
  for (;;) {
    for (const item of items) {
      assertPence(item.amount, `amount for ${item.id}`)
      const dueDate = dueDateInMonth(item.dayOfMonth, year, month)
      if (dueDate < today || dueDate >= payday) continue
      if (item.endDate !== undefined && dueDate > item.endDate) continue
      if (done.has(occurrenceKey(item.id, monthKey(dueDate)))) continue
      result.push({ id: item.id, amount: item.amount, dueDate })
    }
    if (makeDate(year, month, 1).slice(0, 7) >= lastKey) break
    ;[year, month] = nextMonth(year, month)
  }
  return result.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))
}

export function sumPence(amounts: readonly { amount: Pence }[]): Pence {
  return amounts.reduce((total, x) => total + x.amount, 0)
}

// ---------------------------------------------------------------------------
// Food Floor
// ---------------------------------------------------------------------------

export interface FoodSpend {
  date: ISODate
  amount: Pence
}

export interface FoodSettings {
  weeklyFloor: Pence
  /** First day food tracking counts from. Spends before it are ignored. */
  trackingStart: ISODate
  spends: readonly FoodSpend[]
}

/** The Monday on or before the date. */
export function foodWeekStart(date: ISODate): ISODate {
  return addDays(date, 1 - isoWeekday(date))
}

export interface FoodWeek {
  weekStart: ISODate
  /** Unspent money carried in from the previous week. */
  carriedIn: Pence
  /** weeklyFloor + carriedIn. */
  available: Pence
  spent: Pence
  /** available - spent, never below 0. This is what's still set aside this week. */
  remaining: Pence
  /** How much spending went past `available`. Comes out of Safe today, not next week. */
  overspend: Pence
}

/**
 * The food week containing `today`, with rollover worked out week by week since tracking began.
 * Unspent money rolls forward; overspend does not reduce the next week.
 */
export function currentFoodWeek(today: ISODate, food: FoodSettings): FoodWeek {
  assertPence(food.weeklyFloor, 'weekly Food Floor')
  const thisWeek = foodWeekStart(today)
  const spentByWeek = new Map<ISODate, Pence>()
  for (const spend of food.spends) {
    assertPence(spend.amount, 'food spend')
    if (spend.date < food.trackingStart) continue
    const week = foodWeekStart(spend.date)
    spentByWeek.set(week, (spentByWeek.get(week) ?? 0) + spend.amount)
  }

  let week = foodWeekStart(food.trackingStart)
  if (week > thisWeek) week = thisWeek
  let carriedIn = 0
  for (;;) {
    const available = food.weeklyFloor + carriedIn
    const spent = spentByWeek.get(week) ?? 0
    const remaining = Math.max(0, available - spent)
    if (week >= thisWeek) {
      return {
        weekStart: week,
        carriedIn,
        available,
        spent,
        remaining,
        overspend: Math.max(0, spent - available),
      }
    }
    carriedIn = remaining
    week = addDays(week, 7)
  }
}

/**
 * Food money to keep aside until payday: what's left of this food week, plus the full
 * weekly floor for every later food week that starts before payday.
 */
export function foodFloorRemaining(today: ISODate, payday: ISODate, food: FoodSettings): Pence {
  const thisWeek = currentFoodWeek(today, food)
  let total = thisWeek.remaining
  for (let monday = addDays(thisWeek.weekStart, 7); monday < payday; monday = addDays(monday, 7)) {
    total += food.weeklyFloor
  }
  return total
}

// ---------------------------------------------------------------------------
// Safe today
// ---------------------------------------------------------------------------

export type ColourState = 'green' | 'amber' | 'red'

export interface SafeTodayInput {
  today: ISODate
  balance: Pence
  bills: readonly MonthlyItem[]
  pots: readonly MonthlyItem[]
  /** Occurrence keys (see occurrenceKey) for bills paid and pots topped up. */
  done: ReadonlySet<string>
  buffer: Pence
  food: FoodSettings
  plannedDailySpend: Pence
  bankHolidays: readonly ISODate[]
  paydayOverrides: Readonly<Record<MonthKey, ISODate>>
}

export interface SafeTodayResult {
  payday: ISODate
  days: number
  balance: Pence
  billsDue: DueOccurrence[]
  billsTotal: Pence
  potsDue: DueOccurrence[]
  potsTotal: Pence
  foodRemaining: Pence
  buffer: Pence
  /** Money not committed to anything until payday. Can be negative. */
  spare: Pence
  /** spare / days, rounded down to the penny. Can be negative. */
  perDay: Pence
  /** perDay floored at 0: the number to show. */
  display: Pence
  /** Balance doesn't cover bills plus food until payday. */
  foodAtRisk: boolean
  colour: ColourState
}

/**
 * Integer division rounding towards minus infinity, so a share is never overstated.
 */
export function divideDown(amount: Pence, parts: number): Pence {
  if (!Number.isSafeInteger(parts) || parts < 1) throw new RangeError('parts must be >= 1')
  return Math.floor(amount / parts)
}

export function colourState(
  perDay: Pence,
  plannedDailySpend: Pence,
  foodAtRisk: boolean,
): ColourState {
  if (foodAtRisk || perDay <= 0) return 'red'
  if (perDay >= plannedDailySpend) return 'green'
  return 'amber'
}

export function safeToday(input: SafeTodayInput): SafeTodayResult {
  assertPence(input.balance, 'balance')
  assertPence(input.buffer, 'buffer')
  assertPence(input.plannedDailySpend, 'planned daily spend')

  const payday = nextPayday(input.today, input.bankHolidays, input.paydayOverrides)
  const days = daysUntilPayday(input.today, payday)
  const billsDue = dueBeforePayday(input.bills, input.today, payday, input.done)
  const potsDue = dueBeforePayday(input.pots, input.today, payday, input.done)
  const billsTotal = sumPence(billsDue)
  const potsTotal = sumPence(potsDue)
  const foodRemaining = foodFloorRemaining(input.today, payday, input.food)

  const spare = input.balance - billsTotal - foodRemaining - potsTotal - input.buffer
  const perDay = divideDown(spare, days)
  // Food is at risk when the money can't cover bills and food, before pots and buffer.
  const foodAtRisk = input.balance - billsTotal - foodRemaining < 0

  return {
    payday,
    days,
    balance: input.balance,
    billsDue,
    billsTotal,
    potsDue,
    potsTotal,
    foodRemaining,
    buffer: input.buffer,
    spare,
    perDay,
    display: Math.max(0, perDay),
    foodAtRisk,
    colour: colourState(perDay, input.plannedDailySpend, foodAtRisk),
  }
}

// ---------------------------------------------------------------------------
// Debt payoff (e.g. PayPal Credit)
// ---------------------------------------------------------------------------

/**
 * Parse an APR typed as a percentage ('23.9', '23.9%') into basis points (2390).
 * Up to 2 decimal places; 0% is allowed.
 */
export function parseAPR(input: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?%?$/.exec(input.trim())
  if (!match) return null
  const bp = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return bp <= 10_000 ? bp : null
}

/** 2390 -> '23.9%'. */
export function formatAPR(bp: number): string {
  return `${(bp / 100).toString()}%`
}

/**
 * Monthly interest rate for an APR. UK APRs are effective annual rates, so the monthly
 * rate is (1 + APR)^(1/12) - 1, not APR / 12.
 */
export function monthlyRate(aprBp: number): number {
  return Math.pow(1 + aprBp / 10_000, 1 / 12) - 1
}

/** One month's interest on a balance, to the nearest penny. */
export function monthlyInterest(balance: Pence, aprBp: number): Pence {
  if (balance <= 0 || aprBp <= 0) return 0
  return Math.round(balance * monthlyRate(aprBp))
}

/**
 * Estimated PayPal Credit-style minimum: the higher of £5 or 2% of the balance, plus the month's
 * interest, never more than what's owed. Only used for the "minimum payments only" comparison.
 */
export function estimatedMinimum(balance: Pence, interest: Pence): Pence {
  const base = Math.max(500, Math.ceil(balance * 0.02))
  return Math.min(balance + interest, base + interest)
}

export interface DebtTerms {
  aprBp: number
  /** Day of the month the regular payment goes out. */
  dayOfMonth: number
  /** No interest is charged on payment dates up to and including this date. */
  interestFreeUntil?: ISODate
}

export type PaymentRule = Pence | ((balance: Pence, interest: Pence) => Pence)

export interface DebtStep {
  date: ISODate
  interest: Pence
  payment: Pence
  balanceAfter: Pence
}

export interface DebtProjection {
  steps: DebtStep[]
  /** Balance at the end of the simulation. */
  balance: Pence
  cleared: boolean
  /** The payment doesn't cover the interest, so the debt never clears. */
  stuck: boolean
  totalInterest: Pence
  totalPaid: Pence
  payoffDate: ISODate | null
}

/**
 * Step a debt month by month. On each payment date: interest is added (unless still
 * interest-free), then the payment comes off. Payment dates run from `firstPaymentOnOrAfter`.
 * With `before`, only payment dates before it are processed (used to estimate today's balance).
 */
export function simulateDebt(
  startBalance: Pence,
  terms: DebtTerms,
  payment: PaymentRule,
  firstPaymentOnOrAfter: ISODate,
  options: { before?: ISODate; maxMonths?: number } = {},
): DebtProjection {
  assertPence(startBalance, 'debt balance')
  const maxMonths = options.maxMonths ?? 600
  const steps: DebtStep[] = []
  let balance = Math.max(0, startBalance)
  let totalInterest = 0
  let totalPaid = 0
  let stuck = false
  let date = nextOccurrence(terms.dayOfMonth, firstPaymentOnOrAfter)

  while (balance > 0 && steps.length < maxMonths) {
    if (options.before !== undefined && date >= options.before) break
    const interestFree = terms.interestFreeUntil !== undefined && date <= terms.interestFreeUntil
    const interest = interestFree ? 0 : monthlyInterest(balance, terms.aprBp)
    const wanted = typeof payment === 'function' ? payment(balance, interest) : payment
    const paid = Math.min(Math.max(0, wanted), balance + interest)
    if (paid <= interest && interest > 0) {
      stuck = true
      break
    }
    balance = balance + interest - paid
    totalInterest += interest
    totalPaid += paid
    steps.push({ date, interest, payment: paid, balanceAfter: balance })
    date = nextOccurrence(terms.dayOfMonth, addDays(date, 1))
  }

  if (balance > 0 && options.before === undefined && steps.length >= maxMonths) stuck = true
  const cleared = balance === 0
  return {
    steps,
    balance,
    cleared,
    stuck,
    totalInterest,
    totalPaid,
    payoffDate: cleared && steps.length > 0 ? steps[steps.length - 1].date : null,
  }
}

export interface DebtExtraPayment {
  date: ISODate
  amount: Pence
  /** When it was logged, ISO timestamp. */
  loggedAt: string
}

/**
 * Best estimate of what's owed today: the balance last typed in, minus regular payments whose
 * date has passed (with interest added each month), minus extra payments logged since.
 * A payment due today is not counted yet, matching how bills work in Safe today.
 */
export function estimateDebtBalance(
  balance: Pence,
  balanceUpdatedAt: string,
  terms: DebtTerms,
  monthlyPayment: Pence,
  extras: readonly DebtExtraPayment[],
  today: ISODate,
): Pence {
  const updatedDay = balanceUpdatedAt.slice(0, 10)
  const extrasSince = extras
    .filter((e) => e.loggedAt > balanceUpdatedAt)
    .reduce((total, e) => total + e.amount, 0)
  // Extras come off first. That slightly understates interest, which is fine for an estimate
  // that's reset every time the real balance is typed in from PayPal.
  const afterExtras = Math.max(0, balance - extrasSince)
  if (updatedDay >= today) return afterExtras
  return simulateDebt(afterExtras, terms, monthlyPayment, addDays(updatedDay, 1), {
    before: today,
  }).balance
}

/** Months between payments needed to clear `balance` by `deadline` with no interest. */
export function paymentToClearBy(
  balance: Pence,
  dayOfMonth: number,
  today: ISODate,
  deadline: ISODate,
): { payments: number; perPayment: Pence } | null {
  let payments = 0
  for (
    let d = nextOccurrence(dayOfMonth, today);
    d <= deadline;
    d = nextOccurrence(dayOfMonth, addDays(d, 1))
  ) {
    payments++
  }
  if (payments === 0) return null
  return { payments, perPayment: Math.ceil(balance / payments) }
}

/**
 * How much could go to debt right now while keeping Safe today at the usual daily spend:
 * spare money minus the usual daily spend for every day to payday. Never below 0.
 */
export function spareForDebt(result: SafeTodayResult, plannedDailySpend: Pence): Pence {
  return Math.max(0, result.spare - plannedDailySpend * result.days)
}
