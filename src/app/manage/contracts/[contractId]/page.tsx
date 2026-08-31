import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/server/db'
import { getContractDetail } from '@/server/services/management'
import { ApiError } from '@/server/errors'
import { Card, DataPoint, Notice, SectionHeading, StatusBadge } from '@/ui/primitives'
import { formatDateTime, formatMoney, formatRange, humanise } from '@/ui/format'
import { IssueContractButton } from '@/ui/IssueContractButton'
import { ChangeRequestPanel } from '@/ui/ChangeRequestPanel'

/**
 * The internal view of a contract.
 *
 * Everything about the agreement in one place: terms, the campaign it created,
 * the field work under it, the proof that came back, and the full internal
 * history. The client-facing equivalent shows a safe subset of the same
 * record — internal notes and other clients never appear there.
 */
export default async function ManageContractPage({
  params,
}: {
  params: Promise<{ contractId: string }>
}) {
  const { contractId } = await params

  const contract = await getContractDetail(prisma, contractId).catch((error) => {
    if (error instanceof ApiError && error.code === 'not_found') notFound()
    throw error
  })

  const campaign = contract.campaigns[0]
  const assetName = (id: string | null) => contract.assets.find((a) => a.id === id)?.name ?? null

  return (
    <div className="space-y-6">
      <Link href="/manage/contracts" className="text-sm text-brand-600 hover:underline">
        ← All contracts
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Contract · version {contract.version}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">
            <Link
              href={`/manage/clients/${contract.organisationId}`}
              className="hover:text-brand-600"
            >
              {contract.organisation.name}
            </Link>
          </h1>
          <p className="mt-0.5 font-mono text-xs tabular text-ink-500">{contract.id}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={contract.status} className="text-sm" />
          {contract.status === 'draft' ? <IssueContractButton contractId={contract.id} /> : null}
        </div>
      </div>

      {contract.status === 'draft' ? (
        <Notice tone="info" title="Not visible to the client yet">
          A draft exists only inside the agency. Issuing it puts it in the client portal for them
          to accept or query.
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card className="p-5">
            <SectionHeading eyebrow="Terms" title="What was agreed" />
            <dl className="grid gap-4 sm:grid-cols-3">
              <DataPoint
                label="Period"
                value={formatRange(contract.startDate, contract.endDate)}
                mono
              />
              <DataPoint
                label="Total"
                value={formatMoney(contract.total, contract.currency)}
                mono
              />
              <DataPoint
                label="From request"
                value={
                  contract.bookingRequest ? (
                    <Link
                      href={`/manage/requests/${contract.bookingRequest.id}`}
                      className="text-brand-600 hover:underline"
                    >
                      {contract.bookingRequest.id}
                    </Link>
                  ) : (
                    'Created directly'
                  )
                }
              />
            </dl>

            <table className="mt-5 w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left">
                  <th className="pb-2 font-medium text-ink-600">Media</th>
                  <th className="pb-2 font-medium text-ink-600">Asset</th>
                  <th className="pb-2 text-right font-medium text-ink-600">Rate</th>
                  <th className="pb-2 text-right font-medium text-ink-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {contract.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 text-ink-900">{item.product.name}</td>
                    <td className="py-2.5 text-ink-600">
                      {assetName(item.assetId) ?? 'Pool allocation'}
                    </td>
                    <td className="py-2.5 text-right tabular text-ink-600">
                      {formatMoney(item.unitRate, contract.currency)} / {item.rateUnit}
                    </td>
                    <td className="py-2.5 text-right tabular font-medium text-ink-900">
                      {formatMoney(item.lineTotal, contract.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card className="p-5">
            <SectionHeading eyebrow="Delivery" title="Field work" />
            {contract.workOrders.length === 0 ? (
              <p className="text-sm text-ink-500">
                No jobs yet.{' '}
                <Link href="/manage/work-orders" className="text-brand-600 hover:underline">
                  Schedule field work
                </Link>{' '}
                once the contract is accepted.
              </p>
            ) : (
              <ul className="divide-y divide-ink-100">
                {contract.workOrders.map((job) => (
                  <li key={job.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-medium text-ink-900">{humanise(job.type)}</span>
                      <StatusBadge status={job.status} />
                      <span className="font-mono text-xs tabular text-ink-500">
                        {formatDateTime(job.scheduledStart)}
                      </span>
                      <span className="text-sm text-ink-600">
                        {job.assignedUser?.name ?? 'Unassigned'}
                      </span>
                    </div>

                    {job.blockedReason ? (
                      <p className="mt-1 text-sm text-critical">Blocked: {job.blockedReason}</p>
                    ) : null}
                    {job.completionNote ? (
                      <p className="mt-1 text-sm text-ink-700">{job.completionNote}</p>
                    ) : null}
                    {job.internalNotes ? (
                      <p className="mt-1 text-xs text-ink-500">Internal: {job.internalNotes}</p>
                    ) : null}

                    {job.proofRecords.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {job.proofRecords.map((proof) => (
                          <li key={proof.id}>
                            <a
                              href={`/api/proof/${proof.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex rounded-control border border-ink-300 px-2.5 py-1 text-xs text-ink-700 hover:border-brand-500 hover:text-brand-700"
                            >
                              {proof.fileName}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <SectionHeading eyebrow="Audit" title="Internal history" />
            <ol className="space-y-2">
              {contract.history.map((event) => (
                <li key={event.id} className="flex flex-wrap gap-x-3 text-sm">
                  <span className="font-mono text-xs tabular text-ink-500">
                    {formatDateTime(event.at)}
                  </span>
                  <span className="font-medium text-ink-900">{humanise(event.action)}</span>
                  <span className="text-ink-500">by {event.actor}</span>
                  {event.note ? <p className="w-full text-ink-700">{event.note}</p> : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="space-y-4">
          {campaign ? (
            <Card className="p-5">
              <SectionHeading eyebrow="Campaign" title={campaign.name} />
              <dl className="space-y-3">
                <DataPoint label="Status" value={<StatusBadge status={campaign.status} />} />
                <DataPoint label="Stage" value={humanise(campaign.currentStage)} />
                <DataPoint
                  label="Booking"
                  value={
                    campaign.booking
                      ? `${campaign.booking.id} · ${formatRange(campaign.booking.startDate, campaign.booking.endDate)}`
                      : 'None until the client accepts'
                  }
                  mono
                />
              </dl>
            </Card>
          ) : null}

          {contract.status === 'change_requested' ? (
            <ChangeRequestPanel
              contractId={contract.id}
              startDate={contract.startDate}
              endDate={contract.endDate}
              requests={contract.clientRequests
                .filter((r) => r.status === 'submitted')
                .map((r) => ({ id: r.id, summary: r.summary, createdAt: r.createdAt }))}
            />
          ) : null}

          {contract.clientRequests.length > 0 ? (
            <Card className="p-5">
              <SectionHeading eyebrow="Raised by the client" title="Change history" />
              <ul className="space-y-3">
                {contract.clientRequests.map((request) => (
                  <li key={request.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink-800">
                        {humanise(request.type)}
                      </span>
                      <StatusBadge status={request.status} />
                    </div>
                    <p className="mt-1 text-sm text-ink-700">{request.summary}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="p-5">
            <SectionHeading eyebrow="Client sees" title="Service timeline" />
            {contract.serviceEvents.length === 0 ? (
              <p className="text-sm text-ink-500">Nothing published to the client yet.</p>
            ) : (
              <ol className="space-y-3">
                {contract.serviceEvents.map((event) => (
                  <li key={event.id}>
                    <p className="font-mono text-xs tabular text-ink-500">
                      {formatDateTime(event.at)}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-800">
                      {event.clientSummary ?? event.title}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </div>
  )
}
