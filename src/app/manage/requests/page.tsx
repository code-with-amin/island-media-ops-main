import Link from 'next/link'
import { prisma } from '@/server/db'
import { listBookingRequests } from '@/server/services/management'
import { Card, EmptyState, SectionHeading, StatusBadge } from '@/ui/primitives'
import { formatDateTime, formatMoney, formatRange } from '@/ui/format'

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'submitted', label: 'New' },
  { value: 'information_required', label: 'Waiting on client' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
]

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const requests = await listBookingRequests(prisma, status || undefined)

  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Demand" title="Booking requests" />

      <nav className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value ? `/manage/requests?status=${filter.value}` : '/manage/requests'}
            className={`rounded-control border px-3 py-1.5 text-sm ${
              (status ?? '') === filter.value
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-ink-300 text-ink-700 hover:border-brand-400'
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {requests.length === 0 ? (
        <EmptyState
          title="No requests here"
          description="Try a different filter, or wait for a new enquiry to arrive from the catalogue."
        />
      ) : (
        <ul className="space-y-2">
          {requests.map((request) => (
            <Card as="li" key={request.id} className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/manage/requests/${request.id}`}
                    className="font-medium text-ink-900 hover:text-brand-600"
                  >
                    {request.advertiserName}
                  </Link>
                  <p className="mt-0.5 text-sm text-ink-600">
                    {request.product.name} · {request.advertiserContactName}
                  </p>
                </div>
                <span className="font-mono text-xs tabular text-ink-600">
                  {formatRange(request.startDate, request.endDate)}
                </span>
                <span className="font-mono text-xs tabular text-ink-600">
                  {request.budget ? formatMoney(request.budget) : 'No budget given'}
                </span>
                <span className="font-mono text-xs tabular text-ink-400">
                  {formatDateTime(request.createdAt)}
                </span>
                <StatusBadge status={request.status} />
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  )
}
