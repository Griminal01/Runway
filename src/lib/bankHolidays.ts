import type { ISODate } from './money'

/**
 * England & Wales bank holidays, bundled so the app never fetches anything.
 * Source: https://www.gov.uk/bank-holidays.json (england-and-wales), checked 2026-11-17.
 * Update yearly: add the next year's dates when gov.uk publishes them.
 */
export const ENGLAND_AND_WALES_BANK_HOLIDAYS: readonly ISODate[] = [
  // 2026
  '2026-01-01', // New Year's Day
  '2026-04-03', // Good Friday
  '2026-04-06', // Easter Monday
  '2026-05-04', // Early May bank holiday
  '2026-05-25', // Spring bank holiday
  '2026-08-31', // Summer bank holiday
  '2026-12-25', // Christmas Day
  '2026-12-28', // Boxing Day (substitute day)
  // 2027
  '2027-01-01', // New Year's Day
  '2027-03-26', // Good Friday
  '2027-03-29', // Easter Monday
  '2027-05-03', // Early May bank holiday
  '2027-05-31', // Spring bank holiday
  '2027-08-30', // Summer bank holiday
  '2027-12-27', // Christmas Day (substitute day)
  '2027-12-28', // Boxing Day (substitute day)
  // 2028
  '2028-01-03', // New Year's Day (substitute day)
  '2028-04-14', // Good Friday
  '2028-04-17', // Easter Monday
  '2028-05-01', // Early May bank holiday
  '2028-05-29', // Spring bank holiday
  '2028-08-28', // Summer bank holiday
  '2028-12-25', // Christmas Day
  '2028-12-26', // Boxing Day
]

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
