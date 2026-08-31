import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/server/db'
import { getProductDetail } from '@/server/services/catalogue'
import { getSession } from '@/server/session'
import { ApiError } from '@/server/errors'
import { today } from '@/domain/clock'
import { isValidRange } from '@/domain/dates'
import {
  AvailabilityLegend,
  AvailabilityStrip,
  AvailabilitySummary,
  CapacityMeter,
} from '@/ui/AvailabilityStrip'
import { Badge, Card, DataPoint, ErrorNotice, Notice, SectionHeading } from '@/ui/primitives'
import { formatRange, humanise } from '@/ui/format'
import { RequestPanel } from '@/ui/RequestPanel'

function defaultRange() {
  const start = today()
  const end = new Date(`${start}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 30)
  return { startDate: start, endDate: end.toISOString().slice(0, 10) }
}

const SPEC_LABELS: Record<string, string> = {
  format: 'File format',
  widthMm: 'Width (mm)',
  heightMm: 'Height (mm)',
  widthPx: 'Width (px)',
  heightPx: 'Height (px)',
  durationSeconds: 'Duration (seconds)',
  notes: 'Notes',
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { productId } = await params
  const sp = await searchParams
  const fallback = defaultRange()
  const range = {
    startDate: sp.startDate || fallback.startDate,
    endDate: sp.endDate || fallback.endDate,
  }

  if (!isValidRange(range)) {
    return (
      <ErrorNotice
        title="Check your dates."
        details={['The end date has to be later than the start date.']}
      />
    )
  }

  const [session, product] = await Promise.all([
    getSession(),
    getProductDetail(prisma, productId, range).catch((error) => {
      if (error instanceof ApiError && error.code === 'not_found') notFound()
      throw error
    }),
  ])

  const spec = product.creativeSpec ?? {}

  return (
    <div className="space-y-6">
      <Link href={{ pathname: '/', query: range }} className="text-sm text-brand-600 hover:underline">
        ← Back to all media
      </Link>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <div>
            <p className="eyebrow">
              {humanise(product.mediaType)} · {product.mediaOwnerName}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">
              {product.name}
            </h1>
            <p className="mt-2 max-w-2xl text-ink-600">{product.description}</p>
          </div>

          <Card className="p-5">
            <SectionHeading
              eyebrow={`Availability · ${formatRange(range.startDate, range.endDate)}`}
              title={product.availability.available ? 'Available for these dates' : 'Not available for these dates'}
            />

            {product.availability.allocationModel === 'capacity_pool' ? (
              <div className="space-y-3">
                <CapacityMeter
                  capacity={product.availability.capacity}
                  peakUsed={product.availability.peakUsed}
                />
                <p className="text-sm text-ink-600">
                  This is a shared advertising loop. Availability is measured at the busiest
                  moment inside your dates, so a slot free for most of the period but full for
                  three days still counts as full.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <AvailabilitySummary
                  candidates={product.availability.candidates}
                  startDate={range.startDate}
                  endDate={range.endDate}
                />
                <AvailabilityStrip
                  candidates={product.availability.candidates}
                  startDate={range.startDate}
                  endDate={range.endDate}
                />
                <AvailabilityLegend />
              </div>
            )}

            {!product.meetsMinimumTerm ? (
              <div className="mt-4">
                <Notice tone="caution" title={`This product has a ${product.minimumTermDays}-day minimum term.`}>
                  Your dates cover a shorter period. You can still submit a request, and the team
                  will come back to you about the term.
                </Notice>
              </div>
            ) : null}
          </Card>

          <Card className="p-5">
            <SectionHeading eyebrow="Before you book" title="Creative specification" />
            {Object.keys(spec).length === 0 ? (
              <p className="text-sm text-ink-500">
                The specification for this product is confirmed with the media owner once a rate
                is agreed.
              </p>
            ) : (
              <dl className="grid gap-4 sm:grid-cols-2">
                {Object.entries(spec).map(([key, value]) => (
                  <DataPoint
                    key={key}
                    label={SPEC_LABELS[key] ?? humanise(key)}
                    value={String(value)}
                    mono={key !== 'notes'}
                  />
                ))}
              </dl>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <p className="font-mono text-lg font-medium tabular text-ink-900">
              {product.rateLabel}
            </p>
            <p className="mt-1 text-sm text-ink-500">
              Indicative. Confirmed on your contract.
            </p>

            <dl className="mt-4 space-y-3 border-t border-ink-100 pt-4">
              <DataPoint label="Minimum term" value={`${product.minimumTermDays} days`} mono />
              <DataPoint label="Locations" value={product.locationNames.join(', ')} />
              <DataPoint
                label="Allocation"
                value={
                  product.allocationModel === 'capacity_pool'
                    ? 'Shared loop capacity'
                    : 'One named asset, exclusively yours'
                }
              />
            </dl>

            {product.priceOnRequest ? (
              <div className="mt-4">
                <Badge tone="info">Price on request</Badge>
              </div>
            ) : null}
          </Card>

          <RequestPanel
            productId={product.id}
            productName={product.name}
            range={range}
            available={product.availability.available}
            isSignedInClient={session?.role === 'client'}
          />
        </aside>
      </div>
    </div>
  )
}
