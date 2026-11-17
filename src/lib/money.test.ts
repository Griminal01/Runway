import { describe, expect, it } from 'vitest'
import { applyBankHolidayEdits, ENGLAND_AND_WALES_BANK_HOLIDAYS as BH } from './bankHolidays'
import {
  addDays,
  colourState,
  currentFoodWeek,
  daysUntilPayday,
  defaultPayday,
  divideDown,
  dueBeforePayday,
  effectivePayday,
  foodFloorRemaining,
  foodWeekStart,
  formatGBP,
  hasEnded,
  isoWeekday,
  isWorkingDay,
  nextOccurrence,
  nextPayday,
  upcomingPaydays,
  occurrenceKey,
  parseGBP,
  safeToday,
  type FoodSettings,
  type SafeTodayInput,
} from './money'

const NO_OVERRIDES = {}

describe('formatGBP', () => {
  it.each([
    [0, '£0.00'],
    [5, '£0.05'],
    [123456, '£1,234.56'],
    [100000000, '£1,000,000.00'],
    [-1230, '-£12.30'],
  ])('%i -> %s', (pence, text) => {
    expect(formatGBP(pence)).toBe(text)
  })

  it('rejects fractional pence', () => {
    expect(() => formatGBP(12.5)).toThrow(RangeError)
  })
})

describe('parseGBP', () => {
  it.each([
    ['12', 1200],
    ['12.3', 1230],
    ['12.34', 1234],
    ['£1,234.56', 123456],
    [' 0.05 ', 5],
    ['-5.00', -500],
    ['-0', 0],
  ])('%s -> %i', (text, pence) => {
    expect(parseGBP(text)).toBe(pence)
  })

  it.each(['', 'abc', '12.345', '1.2.3', '£', '.50'])('rejects %s', (text) => {
    expect(parseGBP(text)).toBeNull()
  })

  it('avoids floating point errors', () => {
    expect(parseGBP('0.29')).toBe(29)
    expect(parseGBP('1.15')).toBe(115)
  })
})

describe('dates', () => {
  it('knows weekdays', () => {
    expect(isoWeekday('2026-11-16')).toBe(1) // Monday
    expect(isoWeekday('2026-11-22')).toBe(7) // Sunday
    expect(isoWeekday('1969-12-31')).toBe(3) // Wednesday, before the epoch
  })

  it('adds days across months and leap years', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
  })

  it('rejects impossible dates', () => {
    expect(() => isoWeekday('2026-02-30')).toThrow(RangeError)
    expect(() => isoWeekday('27/08/2026')).toThrow(RangeError)
  })

  it('food weeks start on Monday', () => {
    expect(foodWeekStart('2026-11-16')).toBe('2026-11-16')
    expect(foodWeekStart('2026-11-22')).toBe('2026-11-16')
    expect(foodWeekStart('2026-11-23')).toBe('2026-11-23')
  })
})

describe('bank holidays', () => {
  it('treats weekends and bank holidays as non-working', () => {
    expect(isWorkingDay('2026-08-31', BH)).toBe(false) // Summer bank holiday
    expect(isWorkingDay('2026-08-29', BH)).toBe(false) // Saturday
    expect(isWorkingDay('2026-08-28', BH)).toBe(true)
  })

  it('applies user edits', () => {
    const edited = applyBankHolidayEdits(BH, ['2026-06-15'], ['2026-08-31'])
    expect(edited).toContain('2026-06-15')
    expect(edited).not.toContain('2026-08-31')
  })
})

describe('defaultPayday: penultimate working day', () => {
  it.each([
    [2026, 8, '2026-08-27'], // 31st is a bank holiday
    [2027, 8, '2027-08-27'], // 30th is a bank holiday, 31st is the last working day
    [2026, 12, '2026-12-30'], // Christmas holidays fall earlier
    [2027, 12, '2027-12-30'],
    [2027, 5, '2027-05-27'], // 31st is Spring bank holiday
    [2026, 11, '2026-11-27'], // 30th is a Monday
    [2027, 1, '2027-01-28'], // month ends on a weekend
    [2028, 2, '2028-02-28'], // leap year
  ])('%i-%i -> %s', (year, month, expected) => {
    expect(defaultPayday(year, month, BH)).toBe(expected)
  })
})

describe('payday overrides and rollover', () => {
  it('an override replaces the default for that month only', () => {
    const overrides = { '2026-12': '2026-12-23' }
    expect(effectivePayday(2026, 12, BH, overrides)).toBe('2026-12-23')
    expect(effectivePayday(2027, 1, BH, overrides)).toBe('2027-01-28')
  })

  it('finds the next payday', () => {
    expect(nextPayday('2026-11-17', BH, NO_OVERRIDES)).toBe('2026-11-27')
  })

  it('rolls over on payday itself', () => {
    expect(nextPayday('2026-11-27', BH, NO_OVERRIDES)).toBe('2026-12-30')
  })

  it('rolls over after an early override has passed', () => {
    const overrides = { '2026-12': '2026-12-23' }
    expect(nextPayday('2026-12-22', BH, overrides)).toBe('2026-12-23')
    expect(nextPayday('2026-12-23', BH, overrides)).toBe('2027-01-28')
  })

  it('counts today but not payday, and is never below 1', () => {
    expect(daysUntilPayday('2026-11-26', '2026-11-27')).toBe(1)
    expect(daysUntilPayday('2026-11-17', '2026-11-27')).toBe(10)
    expect(daysUntilPayday('2026-11-27', '2026-11-27')).toBe(1)
  })
})

describe('bills and pots due before payday', () => {
  const bills = [
    { id: 'phone', amount: 1500, dayOfMonth: 20 },
    { id: 'insurance', amount: 4500, dayOfMonth: 1 },
    { id: 'gym', amount: 2000, dayOfMonth: 31 },
  ]

  it('includes bills from today up to the day before payday', () => {
    const due = dueBeforePayday(bills, '2026-11-17', '2026-11-27', new Set())
    expect(due.map((d) => d.id)).toEqual(['phone'])
  })

  it('counts a bill due today', () => {
    const due = dueBeforePayday(bills, '2026-11-20', '2026-11-27', new Set())
    expect(due.map((d) => d.id)).toEqual(['phone'])
  })

  it('treats bills whose date has passed as paid', () => {
    const due = dueBeforePayday(bills, '2026-11-21', '2026-11-27', new Set())
    expect(due).toEqual([])
  })

  it('skips a bill ticked as paid', () => {
    const done = new Set([occurrenceKey('phone', '2026-11')])
    expect(dueBeforePayday(bills, '2026-11-17', '2026-11-27', done)).toEqual([])
  })

  it('spans the month boundary and clamps short months', () => {
    const due = dueBeforePayday(bills, '2026-11-27', '2026-12-30', new Set())
    expect(due).toEqual([
      { id: 'gym', amount: 2000, dueDate: '2026-11-30' }, // 31st clamps to 30 Nov
      { id: 'insurance', amount: 4500, dueDate: '2026-12-01' },
      { id: 'phone', amount: 1500, dueDate: '2026-12-20' },
    ])
  })

  it('does not count a bill due on payday', () => {
    const due = dueBeforePayday(
      [{ id: 'rent', amount: 50000, dayOfMonth: 27 }],
      '2026-11-17',
      '2026-11-27',
      new Set(),
    )
    expect(due).toEqual([])
  })
})

describe('food weeks', () => {
  const base: FoodSettings = { weeklyFloor: 5000, trackingStart: '2026-11-02', spends: [] }

  it('rolls unspent money into the next week', () => {
    const food = { ...base, spends: [{ date: '2026-11-03', amount: 3000 }] }
    const week = currentFoodWeek('2026-11-10', food)
    expect(week.carriedIn).toBe(2000)
    expect(week.available).toBe(7000)
  })

  it('keeps rolling over several weeks', () => {
    const week = currentFoodWeek('2026-11-17', base) // 2 untouched weeks before
    expect(week.carriedIn).toBe(10000)
    expect(week.remaining).toBe(15000)
  })

  it('overspend does not reduce next week', () => {
    const food = { ...base, spends: [{ date: '2026-11-04', amount: 8000 }] }
    expect(currentFoodWeek('2026-11-05', food).overspend).toBe(3000)
    const next = currentFoodWeek('2026-11-10', food)
    expect(next.carriedIn).toBe(0)
    expect(next.available).toBe(5000)
  })

  it('ignores spends before tracking started', () => {
    const food = { ...base, spends: [{ date: '2026-10-30', amount: 9999 }] }
    expect(currentFoodWeek('2026-11-03', food).spent).toBe(0)
  })

  it('reserves this week plus every later week that starts before payday', () => {
    const food = { ...base, trackingStart: '2026-11-16' }
    // Today Tue 17 Nov, payday Fri 27 Nov: this week + week of Mon 23 Nov.
    expect(foodFloorRemaining('2026-11-17', '2026-11-27', food)).toBe(10000)
  })

  it('counts a week straddling payday in full', () => {
    const food = { ...base, trackingStart: '2026-11-23' }
    // Week Mon 23 – Sun 29 Nov straddles payday Fri 27; it counts in full.
    expect(foodFloorRemaining('2026-11-26', '2026-11-27', food)).toBe(5000)
  })

  it('does not count a week starting on payday', () => {
    const food = { ...base, trackingStart: '2027-03-22' }
    // Payday overridden to Mon 29 Mar; the week starting that day belongs to the next pay.
    expect(foodFloorRemaining('2027-03-23', '2027-03-29', food)).toBe(5000)
  })

  it('subtracts what has been spent this week', () => {
    const food = {
      ...base,
      trackingStart: '2026-11-16',
      spends: [{ date: '2026-11-16', amount: 1234 }],
    }
    expect(foodFloorRemaining('2026-11-17', '2026-11-27', food)).toBe(10000 - 1234)
  })
})

describe('divideDown and colourState', () => {
  it('never rounds a share up', () => {
    expect(divideDown(1000, 3)).toBe(333)
    expect(divideDown(-1000, 3)).toBe(-334)
    expect(divideDown(999, 1)).toBe(999)
  })

  it.each([
    [2000, 1500, false, 'green'],
    [1500, 1500, false, 'green'],
    [1499, 1500, false, 'amber'],
    [1, 1500, false, 'amber'],
    [0, 1500, false, 'red'],
    [-50, 1500, false, 'red'],
    [5000, 1500, true, 'red'],
  ] as const)('perDay %i, planned %i, food at risk %s -> %s', (perDay, planned, risk, colour) => {
    expect(colourState(perDay, planned, risk)).toBe(colour)
  })
})

describe('safeToday', () => {
  const input: SafeTodayInput = {
    today: '2026-11-17',
    balance: 80000,
    bills: [{ id: 'phone', amount: 1500, dayOfMonth: 20 }],
    pots: [{ id: 'car', amount: 5000, dayOfMonth: 25 }],
    done: new Set(),
    buffer: 10000,
    food: { weeklyFloor: 5000, trackingStart: '2026-11-16', spends: [] },
    plannedDailySpend: 1500,
    bankHolidays: BH,
    paydayOverrides: {},
  }

  it('applies the formula', () => {
    const r = safeToday(input)
    expect(r.payday).toBe('2026-11-27')
    expect(r.days).toBe(10)
    expect(r.billsTotal).toBe(1500)
    expect(r.potsTotal).toBe(5000)
    expect(r.foodRemaining).toBe(10000)
    // 80000 - 1500 - 10000 - 5000 - 10000 = 53500, / 10 days
    expect(r.spare).toBe(53500)
    expect(r.perDay).toBe(5350)
    expect(r.display).toBe(5350)
    expect(r.colour).toBe('green')
    expect(r.foodAtRisk).toBe(false)
  })

  it('rounds down to the penny', () => {
    const r = safeToday({ ...input, balance: 80003 })
    expect(r.perDay).toBe(5350)
  })

  it('goes amber below planned spend', () => {
    const r = safeToday({ ...input, balance: 30000 }) // spare 3500 / 10 = 350
    expect(r.perDay).toBe(350)
    expect(r.colour).toBe('amber')
  })

  it('shows £0 and red when nothing is spare', () => {
    const r = safeToday({ ...input, balance: 20000 })
    expect(r.perDay).toBeLessThan(0)
    expect(r.display).toBe(0)
    expect(r.colour).toBe('red')
    expect(r.foodAtRisk).toBe(false) // bills and food still covered by the buffer
  })

  it('goes red when food is not covered', () => {
    const r = safeToday({ ...input, balance: 11000 })
    expect(r.foodAtRisk).toBe(true)
    expect(r.colour).toBe('red')
  })

  it('food overspend comes out of Safe today, not the food reserve', () => {
    const spent = {
      ...input,
      balance: input.balance - 7000, // the overspend has left the account
      food: { ...input.food, spends: [{ date: '2026-11-16', amount: 7000 }] },
    }
    const r = safeToday(spent)
    // This week: 5000 available, 7000 spent -> 0 left; next week still reserved in full.
    expect(r.foodRemaining).toBe(5000)
    // Balance fell 7000, reserve fell 5000: Safe today absorbs the 2000 overspend.
    expect(r.spare).toBe(53500 - 2000)
  })

  it('measures to the following payday on payday', () => {
    const r = safeToday({ ...input, today: '2026-11-27' })
    expect(r.payday).toBe('2026-12-30')
    expect(r.days).toBe(33)
  })

  it('rejects non-integer money', () => {
    expect(() => safeToday({ ...input, balance: 100.5 })).toThrow(RangeError)
  })
})

describe('nextOccurrence and upcomingPaydays', () => {
  it('finds the next due date, today or later', () => {
    expect(nextOccurrence(20, '2026-11-17')).toBe('2026-11-20')
    expect(nextOccurrence(17, '2026-11-17')).toBe('2026-11-17')
    expect(nextOccurrence(1, '2026-11-17')).toBe('2026-12-01')
    expect(nextOccurrence(31, '2027-02-01')).toBe('2027-02-28')
  })

  it('lists the next paydays, flagging overrides', () => {
    const list = upcomingPaydays('2026-11-17', 3, BH, { '2026-12': '2026-12-23' })
    expect(list).toEqual([
      { month: '2026-11', date: '2026-11-27', calculated: '2026-11-27', overridden: false },
      { month: '2026-12', date: '2026-12-23', calculated: '2026-12-30', overridden: true },
      { month: '2027-01', date: '2027-01-28', calculated: '2027-01-28', overridden: false },
    ])
  })

  it('starts from next month once this payday has passed', () => {
    expect(upcomingPaydays('2026-11-27', 1, BH, {})[0].month).toBe('2026-12')
  })
})

describe('bills with an end date', () => {
  const contract = { id: 'phone', amount: 2500, dayOfMonth: 20, endDate: '2026-12-20' }

  it('counts payments up to and including the final one', () => {
    const due = dueBeforePayday([contract], '2026-12-01', '2027-01-28', new Set())
    expect(due.map((d) => d.dueDate)).toEqual(['2026-12-20'])
  })

  it('stops counting after the final payment', () => {
    expect(dueBeforePayday([contract], '2026-12-31', '2027-02-25', new Set())).toEqual([])
  })

  it('ignores an end date when there is none', () => {
    const open = { id: 'gym', amount: 2000, dayOfMonth: 20 }
    expect(dueBeforePayday([open], '2026-12-31', '2027-02-25', new Set())).toHaveLength(2)
  })

  it('knows when an item has ended', () => {
    expect(hasEnded(contract, '2026-12-20')).toBe(false)
    expect(hasEnded(contract, '2026-12-21')).toBe(true)
    expect(hasEnded({ dayOfMonth: 20 }, '2030-01-01')).toBe(false)
  })
})
