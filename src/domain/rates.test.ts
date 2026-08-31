import { describe, expect, test } from 'vitest'
import { isPriceOnRequest, matchesBudget, rateDisplayLabel } from './rates'

const busRear = {
  rateAmount: 950,
  rateMonthlyEquivalent: 950,
  rateLabel: 'From £950 per month',
}

const hubScreen = {
  // Sold per two weeks; only the monthly equivalent is comparable.
  rateAmount: 600,
  rateMonthlyEquivalent: 1300,
  rateLabel: 'From £600 per 2 weeks',
}

const evScreen = {
  rateAmount: null,
  rateMonthlyEquivalent: null,
  rateLabel: 'Price on request',
}

describe('rateDisplayLabel', () => {
  test('shows the supplied native rate label, not a derived figure', () => {
    expect(rateDisplayLabel(hubScreen)).toBe('From £600 per 2 weeks')
  })

  test('shows price on request when there is no amount', () => {
    expect(rateDisplayLabel(evScreen)).toBe('Price on request')
  })
})

describe('isPriceOnRequest', () => {
  test('a null amount is price on request, not zero', () => {
    expect(isPriceOnRequest(evScreen)).toBe(true)
  })

  test('a priced product is not price on request', () => {
    expect(isPriceOnRequest(busRear)).toBe(false)
  })
})

describe('matchesBudget', () => {
  test('every product matches when no budget filter is applied', () => {
    expect(matchesBudget(evScreen, undefined)).toBe(true)
    expect(matchesBudget(busRear, undefined)).toBe(true)
  })

  test('compares against the monthly equivalent, not the native amount', () => {
    // £600 per 2 weeks looks affordable against £1,000 but is £1,300 a month.
    expect(matchesBudget(hubScreen, 1000)).toBe(false)
  })

  test('includes a product at exactly the budget', () => {
    expect(matchesBudget(busRear, 950)).toBe(true)
  })

  test('includes a product below the budget', () => {
    expect(matchesBudget(busRear, 2000)).toBe(true)
  })

  test('excludes a product with no comparable monthly equivalent', () => {
    // The rule that matters: price-on-request must not silently pass a budget
    // filter just because its price is unknown.
    expect(matchesBudget(evScreen, 5000)).toBe(false)
  })
})
