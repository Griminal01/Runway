import type { ISODate } from './money'

/**
 * England & Wales bank holidays, bundled so the app never fetches anything.
 * Source: https://www.gov.uk/bank-holidays.json (england-and-wales), checked 2026-11-17.
 * Update yearly: add the next year's dates when gov.uk publishes them.
 */
export const BANK_HOLIDAY_LIST: readonly { date: ISODate; name: string }[] = [
  { date: '2026-01-01', name: 'New Year’s Day' },
  { date: '2026-04-03', name: 'Good Friday' },
  { date: '2026-04-06', name: 'Easter Monday' },
  { date: '2026-05-04', name: 'Early May bank holiday' },
  { date: '2026-05-25', name: 'Spring bank holiday' },
  { date: '2026-08-31', name: 'Summer bank holiday' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-28', name: 'Boxing Day (substitute day)' },
  { date: '2027-01-01', name: 'New Year’s Day' },
  { date: '2027-03-26', name: 'Good Friday' },
  { date: '2027-03-29', name: 'Easter Monday' },
  { date: '2027-05-03', name: 'Early May bank holiday' },
  { date: '2027-05-31', name: 'Spring bank holiday' },
  { date: '2027-08-30', name: 'Summer bank holiday' },
  { date: '2027-12-27', name: 'Christmas Day (substitute day)' },
  { date: '2027-12-28', name: 'Boxing Day (substitute day)' },
  { date: '2028-01-03', name: 'New Year’s Day (substitute day)' },
  { date: '2028-04-14', name: 'Good Friday' },
  { date: '2028-04-17', name: 'Easter Monday' },
  { date: '2028-05-01', name: 'Early May bank holiday' },
  { date: '2028-05-29', name: 'Spring bank holiday' },
  { date: '2028-08-28', name: 'Summer bank holiday' },
  { date: '2028-12-25', name: 'Christmas Day' },
  { date: '2028-12-26', name: 'Boxing Day' },
]

export const ENGLAND_AND_WALES_BANK_HOLIDAYS: readonly ISODate[] = BANK_HOLIDAY_LIST.map(
  (h) => h.date,
)

/** Last year covered by the bundled list. The UI can warn when today is past it. */
export const BANK_HOLIDAYS_COVER_UNTIL_YEAR = 2028

/** Apply the user's own additions and removals to the bundled list. */
export function applyBankHolidayEdits(
  bundled: readonly ISODate[],
  added: readonly ISODate[],
  removed: readonly ISODate[],
): ISODate[] {
  const drop = new Set(removed)
  return [...new Set([...bundled, ...added])].filter((d) => !drop.has(d)).sort()
}
