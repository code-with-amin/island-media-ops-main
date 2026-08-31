import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createTestPrisma, resetTestDb } from '../helpers/testDb'
import { getProductDetail, searchProducts } from '@/server/services/catalogue'

const prisma = createTestPrisma()

// The catalogue never mutates, so one seed serves the whole file.
beforeAll(async () => {
  await resetTestDb(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

const FEB = { startDate: '2027-02-12', endDate: '2027-02-18' }

describe('searchProducts', () => {
  test('returns every product with availability calculated for the dates', async () => {
    const results = await searchProducts(prisma, FEB)
    expect(results).toHaveLength(6)
    for (const r of results) {
      expect(r.availability).toBeDefined()
    }
  })

  test('reports the seeded bus rear panel as unavailable for 12-18 February', async () => {
    const results = await searchProducts(prisma, FEB)
    const busRear = results.find((r) => r.id === 'product-bus-rear')
    expect(busRear?.availability.available).toBe(false)
  })

  test('reports a product with a free asset as available', async () => {
    const results = await searchProducts(prisma, { startDate: '2027-09-01', endDate: '2027-10-01' })
    const busRear = results.find((r) => r.id === 'product-bus-rear')
    expect(busRear?.availability.available).toBe(true)
  })

  test('filters by media type', async () => {
    const results = await searchProducts(prisma, { ...FEB, mediaType: 'digital_screen' })
    expect(results.map((r) => r.id).sort()).toEqual(['product-ev-screen', 'product-hub-screen'])
  })

  test('filters by location', async () => {
    const results = await searchProducts(prisma, { ...FEB, locationId: 'loc-central-hub' })
    expect(results.map((r) => r.id).sort()).toEqual(['product-hub-door', 'product-hub-screen'])
  })

  test('filters by maximum monthly budget using the monthly equivalent', async () => {
    // Hub screen is £600 per 2 weeks but £1,300 a month, so a £1,000 budget
    // must exclude it even though its headline figure looks affordable.
    const results = await searchProducts(prisma, { ...FEB, maxMonthlyBudget: 1000 })
    expect(results.map((r) => r.id)).not.toContain('product-hub-screen')
    expect(results.map((r) => r.id)).toContain('product-bus-rear')
  })

  test('excludes a price-on-request product from a budget-filtered search', async () => {
    const results = await searchProducts(prisma, { ...FEB, maxMonthlyBudget: 100_000 })
    expect(results.map((r) => r.id)).not.toContain('product-ev-screen')
  })

  test('includes a price-on-request product when no budget is applied', async () => {
    const results = await searchProducts(prisma, FEB)
    const ev = results.find((r) => r.id === 'product-ev-screen')
    expect(ev?.priceOnRequest).toBe(true)
    expect(ev?.rateLabel).toBe('Price on request')
  })

  test('flags a request shorter than the product minimum term', async () => {
    const results = await searchProducts(prisma, FEB)
    const busRear = results.find((r) => r.id === 'product-bus-rear')
    // Six days against a thirty-day minimum.
    expect(busRear?.meetsMinimumTerm).toBe(false)
  })

  test('rejects a range that ends before it starts', async () => {
    await expect(
      searchProducts(prisma, { startDate: '2027-03-01', endDate: '2027-02-01' }),
    ).rejects.toThrow(/end after it starts/i)
  })
})

describe('getProductDetail', () => {
  test('returns the creative specification and per-asset availability', async () => {
    const detail = await getProductDetail(prisma, 'product-bus-rear', FEB)
    expect(detail.name).toBe('Bus rear panel')
    expect(detail.creativeSpec).toMatchObject({ format: 'PDF or EPS' })
    expect(detail.availability.allocationModel).toBe('exclusive_asset')
    if (detail.availability.allocationModel === 'exclusive_asset') {
      expect(detail.availability.candidates).toHaveLength(3)
    }
  })

  test('returns pool capacity detail for a capacity-pool product', async () => {
    const detail = await getProductDetail(prisma, 'product-hub-screen', {
      startDate: '2027-02-20',
      endDate: '2027-02-28',
    })
    expect(detail.availability.allocationModel).toBe('capacity_pool')
    if (detail.availability.allocationModel === 'capacity_pool') {
      expect(detail.availability.capacity).toBe(4)
      expect(detail.availability.peakUsed).toBe(4)
      expect(detail.availability.available).toBe(false)
    }
  })

  test('a retired asset is reported as a blocked candidate, not hidden', async () => {
    const detail = await getProductDetail(prisma, 'product-bus-wrap', {
      startDate: '2027-08-01',
      endDate: '2027-11-01',
    })
    if (detail.availability.allocationModel === 'exclusive_asset') {
      const retired = detail.availability.candidates.find((c) => c.assetId === 'asset-bus-202-wrap')
      expect(retired?.blockedBy).toBe('retired')
    }
  })

  test('throws for an unknown product', async () => {
    await expect(getProductDetail(prisma, 'product-nope', FEB)).rejects.toThrow(/not be found/i)
  })
})
