import Link from 'next/link'
import { prisma } from '@/server/db'
import { searchProducts } from '@/server/services/catalogue'
import { today } from '@/domain/clock'
import { isValidRange } from '@/domain/dates'
import { CatalogueFilters } from '@/ui/CatalogueFilters'
import {
  AvailabilityLegend,
  AvailabilityStrip,
  AvailabilitySummary,
  CapacityMeter,
} from '@/ui/AvailabilityStrip'
import { Badge, Card, EmptyState, ErrorNotice } from '@/ui/primitives'
import { formatRange, humanise } from '@/ui/format'

/** A month from the prototype clock: long enough to be a real search. */
function defaultRange() {
  const start = today()
  const end = new Date(`${start}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 30)
  return { startDate: start, endDate: end.toISOString().slice(0, 10) }
}

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const fallback = defaultRange()

  const query = {
    startDate: params.startDate || fallback.startDate,
    endDate: params.endDate || fallback.endDate,
    mediaType: params.mediaType || undefined,
    locationId: params.locationId || undefined,
    maxMonthlyBudget: params.maxMonthlyBudget || undefined,
  }

  const [locations, products] = await Promise.all([
    prisma.location.findMany({ orderBy: { name: 'asc' } }),
    prisma.product.findMany({ select: { mediaType: true } }),
  ])
  const mediaTypes = [...new Set(products.map((p) => p.mediaType))].sort()

  const rangeIsValid = isValidRange(query)
  const items = rangeIsValid
    ? await searchProducts(prisma, {
        ...query,
        maxMonthlyBudget: query.maxMonthlyBudget ? Number(query.maxMonthlyBudget) : undefined,
      })
    : []

  const availableCount = items.filter((i) => i.availability.available).length

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Out-of-home advertising · Jersey</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-ink-900">
          Buses, doors, screens and vans
        </h1>
        <p className="mt-2 max-w-2xl text-ink-600">
          Tell us when you need to be seen. We will show you what is genuinely free for those
          dates, and what is not, with the reason.
        </p>
      </div>

      <CatalogueFilters query={query} locations={locations} mediaTypes={mediaTypes} />

      {!rangeIsValid ? (
        <ErrorNotice
          title="Check your dates."
          details={['The end date has to be later than the start date.']}
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing matches those filters"
          description="Try a wider location, a different media type, or raise the monthly budget. Products priced on request are hidden while a budget is set, because we cannot compare them."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-600">
              <span className="font-medium text-ink-900">{items.length}</span> products ·{' '}
              <span className="font-medium text-positive">{availableCount} available</span> for{' '}
              <span className="font-mono tabular">
                {formatRange(query.startDate, query.endDate)}
              </span>
            </p>
            <AvailabilityLegend />
          </div>

          <ul className="space-y-3">
            {items.map((item) => (
              <Card as="li" key={item.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="eyebrow">
                      {humanise(item.mediaType)} · {item.mediaOwnerName}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink-900">
                      <Link href={{ pathname: `/products/${item.id}`, query }} className="hover:text-brand-600">
                        {item.name}
                      </Link>
                    </h2>
                    <p className="mt-1 max-w-xl text-sm text-ink-600">{item.description}</p>
                  </div>

                  <div className="text-right">
                    <p className="font-mono text-sm font-medium tabular text-ink-900">
                      {item.rateLabel}
                    </p>
                    <p className="mt-1 text-xs text-ink-500">
                      Minimum {item.minimumTermDays} days
                    </p>
                    {!item.meetsMinimumTerm ? (
                      <p className="mt-1.5">
                        <Badge tone="caution">Below minimum term</Badge>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 border-t border-ink-100 pt-4">
                  {item.availability.allocationModel === 'capacity_pool' ? (
                    <CapacityMeter
                      capacity={item.availability.capacity}
                      peakUsed={item.availability.peakUsed}
                    />
                  ) : (
                    <div className="space-y-2">
                      <AvailabilitySummary
                        candidates={item.availability.candidates}
                        startDate={query.startDate}
                        endDate={query.endDate}
                        noun={item.availability.candidates.length === 1 ? 'unit' : 'units'}
                      />
                      <AvailabilityStrip
                        candidates={item.availability.candidates}
                        startDate={query.startDate}
                        endDate={query.endDate}
                      />
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <Link
                    href={{ pathname: `/products/${item.id}`, query }}
                    className="rounded-control border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-800 hover:border-brand-500 hover:text-brand-700"
                  >
                    View details
                  </Link>
                  {item.priceOnRequest ? (
                    <span className="text-xs text-ink-500">
                      Rate agreed with the media owner before contract.
                    </span>
                  ) : null}
                </div>
              </Card>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
