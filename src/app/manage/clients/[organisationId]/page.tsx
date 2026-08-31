import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/server/db'
import { getClientDetail } from '@/server/services/management'
import { ApiError } from '@/server/errors'
import { Card, DataPoint, EmptyState, SectionHeading, StatusBadge } from '@/ui/primitives'
import { formatDate, formatDateTime, formatMoney, formatRange, humanise } from '@/ui/format'

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ organisationId: string }>
}) {
  const { organisationId } = await params

  const client = await getClientDetail(prisma, organisationId).catch((error) => {
    if (error instanceof ApiError && error.code === 'not_found') notFound()
    throw error
  })

  return (
    <div className="space-y-6">
      <Link href="/manage/clients" className="text-sm text-brand-600 hover:underline">
        ← All clients
      </Link>

      <div>
        <p className="eyebrow">Client account · {client.organisation.id}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">
          {client.organisation.name}
        </h1>
      </div>

      <Card className="p-5">
        <SectionHeading eyebrow="Who we deal with" title="Contacts" />
        <dl className="grid gap-4 sm:grid-cols-3">
          {client.users.map((user) => (
            <DataPoint key={user.id} label={user.role} value={`${user.name} · ${user.email}`} />
          ))}
          <DataPoint
            label="Account opened"
            value={formatDate(client.organisation.createdAt.toISOString().slice(0, 10))}
            mono
          />
        </dl>
      </Card>

      <Card className="p-5">
        <SectionHeading eyebrow="Agreements" title="Contracts" />
        {client.contracts.length === 0 ? (
          <EmptyState
            title="No contracts yet"
            description="This account can browse and enquire without one. That is a normal state, not a problem to fix."
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {client.contracts.map((contract) => (
              <li key={contract.id} className="flex flex-wrap items-center gap-4 py-3">
                <Link
                  href={`/manage/contracts/${contract.id}`}
                  className="min-w-0 flex-1 font-mono text-sm text-ink-900 hover:text-brand-600"
                >
                  {contract.id}
                </Link>
                <span className="text-sm text-ink-600">
                  {contract.items.map((i) => i.product.name).join(', ')}
                </span>
                <span className="font-mono text-xs tabular text-ink-600">
                  {formatRange(contract.startDate, contract.endDate)}
                </span>
                <span className="font-mono text-sm tabular text-ink-800">
                  {formatMoney(contract.total, contract.currency)}
                </span>
                <StatusBadge status={contract.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <SectionHeading eyebrow="Demand" title="Enquiries" />
        {client.bookingRequests.length === 0 ? (
          <p className="text-sm text-ink-500">No enquiries from this account yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {client.bookingRequests.map((request) => (
              <li key={request.id} className="flex flex-wrap items-center gap-4 py-3">
                <Link
                  href={`/manage/requests/${request.id}`}
                  className="min-w-0 flex-1 text-sm text-ink-900 hover:text-brand-600"
                >
                  {request.product.name}
                </Link>
                <span className="font-mono text-xs tabular text-ink-600">
                  {formatRange(request.startDate, request.endDate)}
                </span>
                <StatusBadge status={request.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {client.clientRequests.length > 0 ? (
        <Card className="p-5">
          <SectionHeading eyebrow="Raised by the client" title="Change and cancellation requests" />
          <ul className="divide-y divide-ink-100">
            {client.clientRequests.map((request) => (
              <li key={request.id} className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium text-ink-900">{humanise(request.type)}</span>
                  <StatusBadge status={request.status} />
                  <span className="font-mono text-xs tabular text-ink-400">
                    {formatDateTime(request.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-700">{request.summary}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}
