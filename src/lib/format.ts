import { formatGBP, type ISODate, type Pence, type SafeTodayResult } from './money'

/** '2026-11-27' -> 'Fri 27 Nov'. */
export function formatShortDate(date: ISODate): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export interface Status {
  label: string
  message: string
}

/** Plain, calm copy for each colour state. Never blames, never warns. */
export function statusFor(result: SafeTodayResult, plannedDailySpend: Pence): Status {
  if (result.foodAtRisk) {
    return {
      label: 'Food first',
      message:
        'Your balance is short of covering bills and food until payday. Food money is still set aside first.',
    }
  }
  if (result.colour === 'red') {
    return {
      label: 'Nothing spare today',
      message: 'Bills and food until payday are covered.',
    }
  }
  if (result.colour === 'amber') {
    return {
      label: 'Lighter day',
      message: `A bit under your usual ${formatGBP(plannedDailySpend)} a day. Bills and food are covered.`,
    }
  }
  return {
    label: 'On track',
    message: 'Bills and food until payday are covered.',
  }
}

export function paydayLine(result: SafeTodayResult): string {
  return `a day until payday on ${formatShortDate(result.payday)} (${plural(result.days, 'day')})`
}
