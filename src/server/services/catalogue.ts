import type { PrismaClient } from '@prisma/client'
import { isValidRange, type DateRange } from '@/domain/dates'
import {
  capacityPoolAvailability,
  exclusiveAssetAvailability,
  meetsMinimumTerm,
  type ExclusiveAvailabilityResult,
  type PoolAvailabilityResult,
} from '@/domain/availability'
import { isPriceOnRequest, matchesBudget } from '@/domain/rates'
import { now } from '@/domain/clock'
import { notFound, validationError } from '../errors'

export type Availability = ExclusiveAvailabilityResult | PoolAvailabilityResult

export interface CatalogueQuery extends DateRange {
  mediaType?: string
  locationId?: string
  maxMonthlyBudget?: number
}

export interface ProductSearchResult {
  id: string
  name: string
  description: string
  mediaType: string
  allocationModel: string
  mediaOwnerName: string
  locationNames: string[]
  rateLabel: string
  priceOnRequest: boolean
  minimumTermDays: number
  meetsMinimumTerm: boolean
  availability: Availability
}

export interface ProductDetail extends ProductSearchResult {
  creativeSpec: Record<string, unknown> | null
}

/**
 * Everything the availability engine needs for one product, in one read.
 *
 * Loading the product with its assets, pools and every competing booking,
 * hold and outage keeps the engine pure — it receives rows and returns an
 * answer, with no database access of its own.
 */
const productInclude = {
  mediaOwner: true,
  locations: { include: { location: true } },
  assets: { include: { outages: true } },
  capacityPools: true,
  bookings: true,
  holds: true,
} as const

type LoadedProduct = Awaited<
  ReturnType<
    (p: PrismaClient) => ReturnType<typeof p.product.findFirstOrThrow<{ include: typeof productInclude }>>
  >
>

function availabilityFor(product: LoadedProduct, range: DateRange): Availability {
  const at = now()

  if (product.allocationModel === 'capacity_pool') {
    const pool = product.capacityPools[0]
    if (!pool) {
      // A pool product with no pool cannot be sold. Reporting zero capacity is
      // honest; inventing capacity would be worse.
      return {
        allocationModel: 'capacity_pool',
        available: false,
        capacity: 0,
        peakUsed: 0,
        remaining: 0,
      }
    }
    return capacityPoolAvailability({
      range,
      now: at,
      capacity: pool.capacity,
      bookings: product.bookings.filter((b) => b.capacityPoolId === pool.id),
      holds: product.holds.filter((h) => h.capacityPoolId === pool.id),
    })
  }

  return exclusiveAssetAvailability({
    range,
    now: at,
    assets: product.assets,
    bookings: product.bookings,
    holds: product.holds,
    outages: product.assets.flatMap((a) => a.outages),
  })
}

function toSearchResult(product: LoadedProduct, range: DateRange): ProductSearchResult {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    mediaType: product.mediaType,
    allocationModel: product.allocationModel,
    mediaOwnerName: product.mediaOwner.name,
    locationNames: product.locations.map((l) => l.location.name),
    rateLabel: product.rateLabel,
    priceOnRequest: isPriceOnRequest(product),
    minimumTermDays: product.minimumTermDays,
    meetsMinimumTerm: meetsMinimumTerm(range, product.minimumTermDays),
    availability: availabilityFor(product, range),
  }
}

function assertValidRange(range: DateRange): void {
  if (!isValidRange(range)) {
    throw validationError('A search must end after it starts.', [
      'Provide valid start and end dates, where the end date is later than the start date.',
    ])
  }
}

export async function searchProducts(
  prisma: PrismaClient,
  query: CatalogueQuery,
): Promise<ProductSearchResult[]> {
  assertValidRange(query)

  const products = await prisma.product.findMany({
    where: {
      ...(query.mediaType ? { mediaType: query.mediaType } : {}),
      ...(query.locationId ? { locations: { some: { locationId: query.locationId } } } : {}),
    },
    include: productInclude,
    orderBy: { name: 'asc' },
  })

  return products
    .filter((p) => matchesBudget(p, query.maxMonthlyBudget))
    .map((p) => toSearchResult(p, query))
}

export async function getProductDetail(
  prisma: PrismaClient,
  productId: string,
  range: DateRange,
): Promise<ProductDetail> {
  assertValidRange(range)

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: productInclude,
  })
  if (!product) throw notFound('That product could not be found.')

  return {
    ...toSearchResult(product, range),
    creativeSpec: product.creativeSpec
      ? (JSON.parse(product.creativeSpec) as Record<string, unknown>)
      : null,
  }
}
