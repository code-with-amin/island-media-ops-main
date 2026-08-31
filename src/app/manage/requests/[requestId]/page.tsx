import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/server/db'
import { getBookingRequestDetail } from '@/server/services/management'
import { ApiError } from '@/server/errors'
import {
  AvailabilityLegend,
  AvailabilityStrip,
  AvailabilitySummary,
  CapacityMeter,
} from '@/ui/AvailabilityStrip'
import {
  Card,
  DataPoint,
  Notice,
  SectionHeading,
  StatusBadge,
} from '@/ui/primitives'
import { formatDateTime, formatMoney, formatRange, humanise } from '@/ui/format'
import { RequestDecisionPanel } from '@/ui/RequestDecisionPanel'

/**
 * Request detail.
 *
 * The page exists to answer one question honestly: can we say yes? So it
 * leads with live availability rather than the request fields, separates the
 * minimum-term problem from the inventory problem — request-001 fails on both,
 * and a manager needs to see both — and surfaces any asset whose availability
 * nobody has confirmed recently before it can be committed.
 */
export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ requestId: string }>
}) {
  const { requestId } = await params

  const request = await getBookingRequestDetail(prisma, requestId).catch((error) => {
    if (error instanceof ApiError && error.code === 'not_found') notFound()
    throw error
  })

  const range = { startDate: request.startDate, endDate: request.endDate }
  const availableAssets =
    request.availability.allocationModel === 'exclusive_asset'
      ? request.availability.candidates.filter((c) => c.available)
      : []

  return (
    <div className="space-y-6">
      <Link href="/manage/requests" className="text-sm text-brand-600 hover:underline">
        ← All requests
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Booking request · {request.id}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">
            {request.advertiserName}
          </h1>
          <p className="mt-1 text-ink-600">
            {request.advertiserContactName} · {request.advertiserEmail}
          </p>
        </div>
        <StatusBadge status={request.status} className="text-sm" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Card className="p-5">
            <SectionHeading
              eyebrow={`Live availability · ${formatRange(range.startDate, range.endDate)}`}
              title={
                request.availability.available
                  ? 'Inventory is free for these dates'
                  : 'Nothing is free for these dates'
              }
            />

            {request.availability.allocationModel === 'capacity_pool' ? (
              <CapacityMeter
                capacity={request.availability.capacity}
                peakUsed={request.availability.peakUsed}
              />
            ) : (
              <div className="space-y-3">
                <AvailabilitySummary
                  candidates={request.availability.candidates}
                  startDate={range.startDate}
                  endDate={range.endDate}
                />
                <AvailabilityStrip
                  candidates={request.availability.candidates}
                  startDate={range.startDate}
                  endDate={range.endDate}
                />
                <AvailabilityLegend />
              </div>
            )}

            <p className="mt-4 text-xs text-ink-500">
              Recalculated on every view, and rechecked again inside the transaction when you
              approve.
            </p>
          </Card>

          {!request.meetsMinimumTerm ? (
            <Notice
              tone="caution"
              title={`Requested period is ${request.requestedDays} days, below the ${request.product.minimumTermDays}-day minimum term.`}
            >
              A separate problem from availability. Even with free inventory this request needs a
              longer period, or a decision to waive the term.
            </Notice>
          ) : null}

          {request.staleVerificationWarnings.length > 0 ? (
            <Notice tone="caution" title="Verify this inventory before committing">
              <ul className="mt-1 space-y-1">
                {request.staleVerificationWarnings.map((warning) => (
                  <li key={warning.assetId}>
                    <span className="font-medium">{warning.assetName}</span> — last confirmed{' '}
                    {warning.daysSinceVerified === null
                      ? 'never'
                      : `${warning.daysSinceVerified} days ago`}
                    {warning.verificationSource ? ` by ${warning.verificationSource}` : ''}.
                  </li>
                ))}
              </ul>
            </Notice>
          ) : null}

          <Card className="p-5">
            <SectionHeading eyebrow="What was asked for" title="Request details" />
            <dl className="grid gap-4 sm:grid-cols-2">
              <DataPoint label="Product" value={request.product.name} />
              <DataPoint label="Period" value={formatRange(range.startDate, range.endDate)} mono />
              <DataPoint
                label="Budget"
                value={request.budget ? formatMoney(request.budget) : 'Not given'}
                mono
              />
              <DataPoint label="Indicative rate" value={request.product.rateLabel} mono />
              <DataPoint label="Objective" value={request.objective ?? '—'} />
              <DataPoint label="Notes" value={request.notes ?? '—'} />
            </dl>

            {request.organisation ? (
              <p className="mt-5 border-t border-ink-100 pt-4 text-sm">
                <Link
                  href={`/manage/clients/${request.organisation.id}`}
                  className="text-brand-600 hover:underline"
                >
                  View {request.organisation.name} account →
                </Link>
              </p>
            ) : (
              <p className="mt-5 border-t border-ink-100 pt-4 text-sm text-ink-500">
                This enquiry has no client account attached, so it cannot become a contract until
                one is created.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <SectionHeading eyebrow="Audit" title="History" />
            <ol className="space-y-3">
              {request.history.map((event) => (
                <li key={event.id} className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                  <span className="font-mono text-xs tabular text-ink-500">
                    {formatDateTime(event.at)}
                  </span>
                  <span className="font-medium text-ink-900">{humanise(event.action)}</span>
                  <span className="text-ink-500">by {event.actor}</span>
                  {event.note ? (
                    <p className="w-full text-ink-700">{event.note}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside>
          <RequestDecisionPanel
            requestId={request.id}
            isDecided={request.isDecided}
            status={request.status}
            existingContract={
              request.existingContract
                ? { id: request.existingContract.id, status: request.existingContract.status }
                : null
            }
            available={request.availability.available}
            meetsMinimumTerm={request.meetsMinimumTerm}
            hasOrganisation={Boolean(request.organisationId)}
            availableAssets={availableAssets.map((a) => ({ id: a.assetId, name: a.assetName }))}
            allocationModel={request.availability.allocationModel}
          />
        </aside>
      </div>
    </div>
  )
}
