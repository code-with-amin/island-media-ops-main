/**
 * Rate display and budget comparison.
 *
 * Three rules from the brief live here, and each one is a trap:
 *
 * 1. Display the supplied native label. "From £600 per 2 weeks" is what the
 *    client is quoted; never re-derive or normalise it for display.
 * 2. Use monthlyEquivalent ONLY for the budget filter, because that is the
 *    only figure comparable across products sold by month, fortnight or loop.
 * 3. A null price means "Price on request", never zero — and a product with no
 *    comparable monthly figure must not silently pass a budget filter.
 */

export interface RateFields {
  rateAmount: number | null
  rateMonthlyEquivalent: number | null
  rateLabel: string
}

export function isPriceOnRequest(rate: RateFields): boolean {
  return rate.rateAmount === null
}

export function rateDisplayLabel(rate: RateFields): string {
  return rate.rateLabel
}

/**
 * Whether a product should survive a maximum-monthly-budget filter.
 *
 * With no budget supplied, everything matches. With a budget supplied, a
 * product needs a monthly equivalent to be comparable at all — an unknown
 * price is excluded rather than assumed affordable.
 */
export function matchesBudget(rate: RateFields, maxMonthlyBudget: number | undefined): boolean {
  if (maxMonthlyBudget === undefined) return true
  if (rate.rateMonthlyEquivalent === null) return false
  return rate.rateMonthlyEquivalent <= maxMonthlyBudget
}
