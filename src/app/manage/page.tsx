import Link from 'next/link'
import { prisma } from '@/server/db'
import { getDashboard } from '@/server/services/management'
import { Card, EmptyState, SectionHeading, StatusBadge } from '@/ui/primitives'
import { formatDate, formatDateTime, formatMoney, formatRange, humanise } from '@/ui/format'

/**
 * The management home.
 *
 * Ordered by who is blocked, not by entity type. Decisions waiting on this
 * team come first; then work waiting on a client, which the team may need to
 * chase; then field work already in motion. A list of every record in the
 * database would answer a different, less useful question.
 */
export default async function ManageDashboard() {
  const dashboard = await getDashboard(prisma)

  const queues = [
    dashboard.awaitingDecision.length,
    dashboard.clientRequests.length,
    dashboard.blockedWork.length,
  ]
  const needsYou = queues.reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Today · 15 January 2027</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">
          {needsYou === 0
            ? 'Nothing is waiting on you'
            : `${needsYou} ${needsYou === 1 ? 'thing needs' : 'things need'} a decision`}
        </h1>
      </div>

      {dashboard.blockedWork.length > 0 ? (
        <section>
          <SectionHeading eyebrow="Blocked on site" title="A fitter cannot finish" />
          <div className="space-y-2">
            {dashboard.blockedWork.map((job) => (
              <Card key={job.id} className="border-critical/40 p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/manage/work-orders`}
                      className="font-mono text-sm font-medium text-ink-900 hover:text-brand-600"
                    >
                      {job.id}
                    </Link>
                    <p className="mt-0.5 text-sm text-critical">{job.blockedReason}</p>
                  </div>
                  <span className="text-sm text-ink-600">{job.locationLabel}</span>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeading
          eyebrow="Needs a decision"
          title="New and open requests"
          action={
            <Link href="/manage/requests" className="text-sm text-brand-600 hover:underline">
              All requests
            </Link>
          }
        />

        {dashboard.awaitingDecision.length === 0 ? (
          <EmptyState
            title="No requests waiting"
            description="New enquiries from the catalogue and the client portal arrive here."
          />
        ) : (
          <ul className="space-y-2">
            {dashboard.awaitingDecision.map((request) => (
              <Card as="li" key={request.id} className="p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/manage/requests/${request.id}`}
                      className="font-medium text-ink-900 hover:text-brand-600"
                    >
                      {request.advertiserName}
                    </Link>
                    <p className="mt-0.5 text-sm text-ink-600">{request.productName}</p>
                  </div>
                  <span className="font-mono text-xs tabular text-ink-600">
                    {formatRange(request.startDate, request.endDate)}
                  </span>
                  <span className="font-mono text-xs tabular text-ink-400">
                    received {formatDate(request.createdAt.toISOString().slice(0, 10))}
                  </span>
                  <Link
                    href={`/manage/requests/${request.id}`}
                    className="rounded-control bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    Review
                  </Link>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>

      {dashboard.clientRequests.length > 0 ? (
        <section>
          <SectionHeading eyebrow="Needs a decision" title="Client change requests" />
          <ul className="space-y-2">
            {dashboard.clientRequests.map((request) => (
              <Card as="li" key={request.id} className="p-4">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="font-medium text-ink-900">{request.organisationName}</span>
                  <StatusBadge status={request.status} />
                  <span className="font-mono text-xs tabular text-ink-400">
                    {formatDateTime(request.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-700">{request.summary}</p>
                <p className="mt-1 text-xs text-ink-500">{humanise(request.type)}</p>
              </Card>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <SectionHeading
          eyebrow="Waiting on the client"
          title="Contracts issued, not yet answered"
          action={
            <Link href="/manage/contracts" className="text-sm text-brand-600 hover:underline">
              All contracts
            </Link>
          }
        />

        {dashboard.awaitingClient.length === 0 ? (
          <EmptyState
            title="No contracts waiting on a client"
            description="Contracts you issue appear here until the client accepts or asks for a change."
          />
        ) : (
          <ul className="space-y-2">
            {dashboard.awaitingClient.map((contract) => (
              <Card as="li" key={contract.id} className="p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/manage/contracts/${contract.id}`}
                      className="font-medium text-ink-900 hover:text-brand-600"
                    >
                      {contract.organisationName}
                    </Link>
                    <p className="font-mono text-xs tabular text-ink-500">{contract.id}</p>
                  </div>
                  <span className="font-mono text-sm tabular text-ink-800">
                    {formatMoney(contract.total)}
                  </span>
                  <span className="font-mono text-xs tabular text-ink-400">
                    issued {contract.issuedAt ? formatDateTime(contract.issuedAt) : '—'}
                  </span>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading
          eyebrow="In motion"
          title="Scheduled field work"
          action={
            <Link href="/manage/work-orders" className="text-sm text-brand-600 hover:underline">
              All field work
            </Link>
          }
        />

        {dashboard.upcomingWork.length === 0 ? (
          <EmptyState
            title="No field work scheduled"
            description="Create a work order from an active contract to get an installation into a fitter's app."
          />
        ) : (
          <ul className="space-y-2">
            {dashboard.upcomingWork.map((job) => (
              <Card as="li" key={job.id} className="p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900">{humanise(job.type)}</p>
                    <p className="text-sm text-ink-600">{job.locationLabel}</p>
                  </div>
                  <span className="font-mono text-xs tabular text-ink-600">
                    {formatDateTime(job.scheduledStart)}
                  </span>
                  <span className="text-sm text-ink-600">{job.assignedTo ?? 'Unassigned'}</span>
                  <StatusBadge status={job.status} />
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
