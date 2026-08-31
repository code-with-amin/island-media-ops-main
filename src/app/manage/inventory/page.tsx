import { prisma } from '@/server/db'
import { getInventory } from '@/server/services/management'
import { today } from '@/domain/clock'
import { isValidRange } from '@/domain/dates'
import {
  AvailabilityLegend,
  AvailabilityStrip,
  AvailabilitySummary,
  CapacityMeter,
} from '@/ui/AvailabilityStrip'
import { Badge, Card, ErrorNotice, Field, SectionHeading, inputClass } from '@/ui/primitives'
import { formatRange, humanise } from '@/ui/format'

function defaultRange() {
  const start = today()
  const end = new Date(`${start}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 60)
  return { startDate: start, endDate: end.toISOString().slice(0, 10) }
}

/**
 * Inventory and availability context.
 *
 * The same strip the client sees, over a longer default window, plus the one
 * thing a client never sees: which assets nobody has confirmed with the media
 * owner recently. Committing a client to inventory that has not been verified
 * is the expensive mistake this page exists to prevent.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const fallback = defaultRange()
  const range = {
    startDate: params.startDate || fallback.startDate,
    endDate: params.endDate || fallback.endDate,
  }

  if (!isValidRange(range)) {
    return <ErrorNotice title="Check your dates." details={['The end date must be later than the start date.']} />
  }

  const inventory = await getInventory(prisma, range)
  const staleCount = inventory.reduce((n, p) => n + p.staleVerificationWarnings.length, 0)

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow={`Availability · ${formatRange(range.startDate, range.endDate)}`}
        title="Inventory"
      />

      <form method="get" className="flex flex-wrap items-end gap-4 rounded-card border border-ink-200 bg-surface p-4">
        <Field label="From" className="w-44">
          <input type="date" name="startDate" defaultValue={range.startDate} className={inputClass} />
        </Field>
        <Field label="Until" className="w-44">
          <input type="date" name="endDate" defaultValue={range.endDate} className={inputClass} />
        </Field>
        <button
          type="submit"
          className="rounded-control bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Recalculate
        </button>
        <div className="ml-auto">
          <AvailabilityLegend />
        </div>
      </form>

      {staleCount > 0 ? (
        <div className="rounded-control border border-caution/30 bg-caution-soft px-4 py-3 text-sm">
          <span className="font-medium text-ink-900">
            {staleCount} asset{staleCount === 1 ? '' : 's'} not verified in the last 30 days.
          </span>{' '}
          <span className="text-ink-700">Confirm with the media owner before committing them.</span>
        </div>
      ) : null}

      <ul className="space-y-3">
        {inventory.map((product) => (
          <Card as="li" key={product.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="eyebrow">
                  {humanise(product.mediaType)} · {product.mediaOwnerName}
                </p>
                <h3 className="mt-1 font-semibold text-ink-900">{product.name}</h3>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm tabular text-ink-700">{product.rateLabel}</p>
                {product.availability.available ? (
                  <Badge tone="positive">Available</Badge>
                ) : (
                  <Badge tone="critical">Nothing free</Badge>
                )}
              </div>
            </div>

            <div className="mt-4">
              {product.availability.allocationModel === 'capacity_pool' ? (
                <CapacityMeter
                  capacity={product.availability.capacity}
                  peakUsed={product.availability.peakUsed}
                />
              ) : (
                <div className="space-y-2">
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
                </div>
              )}
            </div>

            {product.staleVerificationWarnings.length > 0 ? (
              <ul className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-xs text-caution">
                {product.staleVerificationWarnings.map((warning) => (
                  <li key={warning.assetId}>
                    {warning.assetName} — last confirmed{' '}
                    {warning.daysSinceVerified === null
                      ? 'never'
                      : `${warning.daysSinceVerified} days ago`}
                    {warning.verificationSource ? ` by ${warning.verificationSource}` : ''}.
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>
        ))}
      </ul>
    </div>
  )
}
