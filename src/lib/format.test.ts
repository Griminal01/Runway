import { describe, expect, it } from 'vitest'
import {
  formatMonth,
  formatShortDate,
  ordinal,
  paydayLine,
  penceToInput,
  plural,
  statusFor,
} from './format'
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

describe('ordinal and formatMonth', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [31, '31st'],
  ])('%i -> %s', (n, text) => {
    expect(ordinal(n)).toBe(text)
  })

  it('formats months', () => {
    expect(formatMonth('2026-12')).toBe('December 2026')
  })
})

describe('penceToInput', () => {
  it.each([
    [0, '0.00'],
    [5, '0.05'],
    [123456, '1234.56'],
    [-250, '-2.50'],
  ])('%i -> %s', (pence, text) => {
    expect(penceToInput(pence)).toBe(text)
  })
})
