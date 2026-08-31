/**
 * Calendar-date arithmetic for half-open ranges.
 *
 * Every date in the domain is an ISO calendar date string, "YYYY-MM-DD".
 * Because that format is fixed-width and zero-padded, lexicographic string
 * comparison is also chronological comparison — so none of this needs Date
 * objects, and none of it can drift by a timezone.
 *
 * Ranges are half-open: [startDate, endDate). The end date is the first day
 * NOT covered. Two campaigns where one ends on the day the next begins do not
 * overlap.
 */

export interface DateRange {
  startDate: string
  endDate: string
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const MS_PER_DAY = 86_400_000

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  // Rejects impossible dates such as 2027-02-30, which the regex allows.
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

/** A range is valid when both dates parse and it ends strictly after it starts. */
export function isValidRange(range: DateRange): boolean {
  if (!isIsoDate(range.startDate) || !isIsoDate(range.endDate)) return false
  return range.startDate < range.endDate
}

/** True when the two half-open ranges share at least one covered day. */
export function overlaps(a: DateRange, b: DateRange): boolean {
  return a.startDate < b.endDate && b.startDate < a.endDate
}

/** Number of days the range covers. The exclusive end day is not counted. */
export function rangeLengthDays(range: DateRange): number {
  const start = Date.parse(`${range.startDate}T00:00:00Z`)
  const end = Date.parse(`${range.endDate}T00:00:00Z`)
  return Math.round((end - start) / MS_PER_DAY)
}
