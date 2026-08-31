import { describe, expect, test } from 'vitest'
import { isValidRange, overlaps, rangeLengthDays } from './dates'

/**
 * Date ranges are half-open: [startDate, endDate). The end date is the first
 * day NOT covered. Getting this wrong is the single most likely source of a
 * wrong availability answer, so it is pinned down before anything else.
 */
describe('overlaps', () => {
  test('ranges that share interior days overlap', () => {
    expect(
      overlaps(
        { startDate: '2027-02-12', endDate: '2027-02-18' },
        { startDate: '2027-02-15', endDate: '2027-04-01' },
      ),
    ).toBe(true)
  })

  test('a range ending on the day another starts does not overlap', () => {
    // Half-open: 2027-03-01 is covered by the second range only.
    expect(
      overlaps(
        { startDate: '2027-02-01', endDate: '2027-03-01' },
        { startDate: '2027-03-01', endDate: '2027-04-01' },
      ),
    ).toBe(false)
  })

  test('a range starting on the day another ends does not overlap', () => {
    expect(
      overlaps(
        { startDate: '2027-03-01', endDate: '2027-04-01' },
        { startDate: '2027-02-01', endDate: '2027-03-01' },
      ),
    ).toBe(false)
  })

  test('a range fully containing another overlaps', () => {
    expect(
      overlaps(
        { startDate: '2027-01-01', endDate: '2027-07-01' },
        { startDate: '2027-02-10', endDate: '2027-02-20' },
      ),
    ).toBe(true)
  })

  test('a single shared day is an overlap', () => {
    expect(
      overlaps(
        { startDate: '2027-02-01', endDate: '2027-02-02' },
        { startDate: '2027-02-01', endDate: '2027-02-02' },
      ),
    ).toBe(true)
  })
})

describe('isValidRange', () => {
  test('accepts a range that ends after it starts', () => {
    expect(isValidRange({ startDate: '2027-02-01', endDate: '2027-02-02' })).toBe(true)
  })

  test('rejects a zero-length range', () => {
    expect(isValidRange({ startDate: '2027-02-01', endDate: '2027-02-01' })).toBe(false)
  })

  test('rejects a range that ends before it starts', () => {
    expect(isValidRange({ startDate: '2027-02-10', endDate: '2027-02-01' })).toBe(false)
  })

  test('rejects a malformed date', () => {
    expect(isValidRange({ startDate: '2027-2-1', endDate: '2027-02-10' })).toBe(false)
  })
})

describe('rangeLengthDays', () => {
  test('counts covered days, excluding the exclusive end', () => {
    expect(rangeLengthDays({ startDate: '2027-02-12', endDate: '2027-02-18' })).toBe(6)
  })

  test('counts a whole month correctly', () => {
    expect(rangeLengthDays({ startDate: '2027-02-01', endDate: '2027-03-01' })).toBe(28)
  })
})
