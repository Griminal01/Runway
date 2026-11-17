import { describe, expect, it } from 'vitest'
import { formatShortDate, paydayLine, plural, statusFor } from './format'
import type { SafeTodayResult } from './money'

const base: SafeTodayResult = {
  payday: '2026-11-27',
  days: 10,
  balance: 80000,
  billsDue: [],
  billsTotal: 0,
  potsDue: [],
  potsTotal: 0,
  foodRemaining: 0,
  buffer: 0,
  spare: 53500,
  perDay: 5350,
  display: 5350,
  foodAtRisk: false,
  colour: 'green',
}

describe('format', () => {
  it('formats short dates', () => {
    expect(formatShortDate('2026-11-27')).toBe('Fri 27 Nov')
    expect(formatShortDate('2027-01-01')).toBe('Fri 1 Jan')
  })

  it('pluralises', () => {
    expect(plural(1, 'day')).toBe('1 day')
    expect(plural(10, 'day')).toBe('10 days')
  })

  it('describes the payday line', () => {
    expect(paydayLine(base)).toBe('a day until payday on Fri 27 Nov (10 days)')
    expect(paydayLine({ ...base, days: 1 })).toBe('a day until payday on Fri 27 Nov (1 day)')
  })

  it('has a calm status for each state', () => {
    expect(statusFor(base, 1500).label).toBe('On track')
    expect(statusFor({ ...base, colour: 'amber' }, 1500).message).toContain('£15.00')
    expect(statusFor({ ...base, colour: 'red' }, 1500).label).toBe('Nothing spare today')
    expect(statusFor({ ...base, colour: 'red', foodAtRisk: true }, 1500).label).toBe('Food first')
  })

  it('never uses guilt-tripping words', () => {
    const states: SafeTodayResult[] = [
      base,
      { ...base, colour: 'amber' },
      { ...base, colour: 'red' },
      { ...base, colour: 'red', foodAtRisk: true },
    ]
    for (const s of states) {
      const { label, message } = statusFor(s, 1500)
      expect(`${label} ${message}`).not.toMatch(/overspen|warning|careful|bad|fail|!/i)
    }
  })
})
