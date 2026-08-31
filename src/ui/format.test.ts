import { describe, expect, test } from 'vitest'
import { availabilityPhrase, formatSpan } from './format'

/** A year-long search, where a one-month booking is the exception. */
const YEAR = { startDate: '2026-08-31', endDate: '2027-08-29' }
/** A one-month search, where a booking easily runs to the edge. */
const MONTH = { startDate: '2027-01-15', endDate: '2027-02-14' }

describe('formatSpan', () => {
  test('collapses a range within one month', () => {
    // Half-open 1 Feb to 1 Mar covers 1–28 February.
    expect(formatSpan({ startDate: '2027-02-01', endDate: '2027-03-01' })).toBe('1–28 Feb')
  })

  test('spells out a range crossing months', () => {
    expect(formatSpan({ startDate: '2027-02-10', endDate: '2027-03-06' })).toBe('10 Feb – 5 Mar')
  })

  test('shows a single day as one date', () => {
    expect(formatSpan({ startDate: '2027-02-10', endDate: '2027-02-11' })).toBe('10 Feb')
  })

  test('includes the year when a range crosses one', () => {
    expect(formatSpan({ startDate: '2026-12-20', endDate: '2027-01-06' })).toBe(
      '20 Dec 2026 – 5 Jan 2027',
    )
  })
})

describe('availabilityPhrase', () => {
  test('says so plainly when nothing blocks the whole window', () => {
    expect(availabilityPhrase([], YEAR)).toBe('free all period')
  })

  test('names the exact blocked period rather than saying "and again later"', () => {
    // The case that made "free until 1 Feb, and again later" unusable: over a
    // year, the reader had no way to know when "later" began.
    expect(availabilityPhrase([{ startDate: '2027-02-01', endDate: '2027-03-01' }], YEAR)).toBe(
      'free except 1–28 Feb',
    )
  })

  test('names both periods when there are two', () => {
    expect(
      availabilityPhrase(
        [
          { startDate: '2027-02-10', endDate: '2027-02-20' },
          { startDate: '2027-03-05', endDate: '2027-03-15' },
        ],
        YEAR,
      ),
    ).toBe('free except 10–19 Feb and 5–14 Mar')
  })

  test('counts them once there are too many to read', () => {
    expect(
      availabilityPhrase(
        [
          { startDate: '2027-02-10', endDate: '2027-02-20' },
          { startDate: '2027-03-05', endDate: '2027-03-15' },
          { startDate: '2027-04-05', endDate: '2027-04-15' },
        ],
        YEAR,
      ),
    ).toBe('free except 3 periods')
  })

  test('reads as "until" when the block runs to the end of the window', () => {
    expect(availabilityPhrase([{ startDate: '2027-02-01', endDate: '2027-02-14' }], MONTH)).toBe(
      'free until 1 Feb',
    )
  })

  test('reads as "from" when the block starts at the window', () => {
    expect(availabilityPhrase([{ startDate: '2027-01-15', endDate: '2027-02-01' }], MONTH)).toBe(
      'free from 1 Feb',
    )
  })

  test('says nothing is free when the window is entirely blocked', () => {
    expect(availabilityPhrase([MONTH], MONTH)).toBe('not free in this period')
  })
})
