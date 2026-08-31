/**
 * Display formatting. Kept apart from the domain, which deals in ISO strings
 * and numbers; only the interface cares what a date looks like to a person.
 */

const DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const DATE_SHORT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})

/** All dates are UTC-anchored in this prototype; see the README assumption. */
export const formatDate = (iso: string) => DATE.format(new Date(`${iso}T00:00:00Z`))
export const formatDateShort = (iso: string) => DATE_SHORT.format(new Date(`${iso}T00:00:00Z`))

export const formatDateTime = (value: Date | string) => {
  const d = typeof value === 'string' ? new Date(value) : value
  return `${DATE.format(d)}, ${TIME.format(d)}`
}

export const formatTime = (value: Date | string) =>
  TIME.format(typeof value === 'string' ? new Date(value) : value)

/**
 * A half-open range, shown inclusively.
 *
 * The domain stores 1 Feb to 1 Mar; a person reading a contract expects
 * "1 Feb – 28 Feb", because the last day covered is the day before the end.
 */
export function formatRange(startDate: string, endDate: string): string {
  const lastDay = new Date(`${endDate}T00:00:00Z`)
  lastDay.setUTCDate(lastDay.getUTCDate() - 1)
  return `${formatDateShort(startDate)} – ${DATE.format(lastDay)}`
}

export function formatMoney(amount: number, currency = 'GBP'): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)
}

/** Sentence case for a snake_case status or type coming from the database. */
export const humanise = (value: string) =>
  value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

/**
 * A half-open span, written the way a person would say it.
 *
 * The stored end date is exclusive, so it is stepped back a day first: a
 * booking held from 1 February to 1 March covers "1–28 Feb".
 */
export function formatSpan(span: { startDate: string; endDate: string }): string {
  const from = new Date(`${span.startDate}T00:00:00Z`)
  const to = new Date(new Date(`${span.endDate}T00:00:00Z`).getTime() - 86_400_000)

  const sameDay = from.getTime() === to.getTime()
  const sameMonth = from.getUTCMonth() === to.getUTCMonth() && from.getUTCFullYear() === to.getUTCFullYear()
  const sameYear = from.getUTCFullYear() === to.getUTCFullYear()

  const day = (d: Date) => String(d.getUTCDate())
  const monthName = (d: Date) =>
    new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(d)

  if (sameDay) return `${day(from)} ${monthName(from)}`
  if (sameMonth) return `${day(from)}–${day(to)} ${monthName(from)}`
  if (sameYear) return `${day(from)} ${monthName(from)} – ${day(to)} ${monthName(to)}`

  // Crossing a year: say which, or the reader has to work it out.
  return (
    `${day(from)} ${monthName(from)} ${from.getUTCFullYear()} – ` +
    `${day(to)} ${monthName(to)} ${to.getUTCFullYear()}`
  )
}

/**
 * What an asset's availability means for the person reading it.
 *
 * Describes the EXCEPTIONS rather than the availability. Over a long search a
 * bus booked for one month in twelve is overwhelmingly free, and saying "free
 * until 1 February, and again later" both buries that and leaves "later"
 * unanswerable. "Free except 1–28 Feb" is shorter, complete and exact.
 *
 * Two shapes read better as availability, and are special-cased: a block
 * running to the end of the window is "free until", and one starting at the
 * window is "free from".
 */
export function availabilityPhrase(
  blocked: { startDate: string; endDate: string }[],
  range: { startDate: string; endDate: string },
): string {
  if (blocked.length === 0) return 'free all period'

  const first = blocked[0]!
  const last = blocked[blocked.length - 1]!

  if (blocked.length === 1) {
    const touchesStart = first.startDate <= range.startDate
    const touchesEnd = first.endDate >= range.endDate

    if (touchesStart && touchesEnd) return 'not free in this period'
    if (touchesEnd) return `free until ${formatDateShort(first.startDate)}`
    if (touchesStart) return `free from ${formatDateShort(first.endDate)}`
    return `free except ${formatSpan(first)}`
  }

  if (blocked.length === 2) {
    return `free except ${formatSpan(first)} and ${formatSpan(last)}`
  }

  // Beyond two, a list stops being readable at a glance; the bar and its
  // tooltips carry the detail.
  return `free except ${blocked.length} periods`
}
