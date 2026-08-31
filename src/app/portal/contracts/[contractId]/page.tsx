import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/server/db'
import { getSession } from '@/server/session'
import { getClientContract } from '@/server/services/clientPortal'
import { ApiError } from '@/server/errors'
import {
  Card,
  DataPoint,
  EmptyState,
  Notice,
  SectionHeading,
  StatusBadge,
} from '@/ui/primitives'
import { formatDateTime, formatMoney, formatRange, humanise } from '@/ui/format'
import { ContractActions } from '@/ui/ContractActions'

export default async function ClientContractPage({
  params,
}: {
  params: Promise<{ contractId: string }>
}) {
  const session = await getSession()
  const { contractId } = await params

  if (!session || session.role !== 'client' || !session.organisationId) {
    return (
      <EmptyState
        title="Sign in to see this contract"
        description="Use the account switcher above to sign in as a client account."
      />
    )
  }

  // Scoped by organisation: another organisation's contract is not found here,
  // not forbidden, so this page never confirms that it exists.
  const contract = await getClientContract(prisma, session.organisationId, contractId).catch(
    (error) => {
      if (error instanceof ApiError && error.code === 'not_found') notFound()
      throw error
    },
  )

  return (
    <div className="space-y-6">
      <Link href="/portal/contracts" className="text-sm text-brand-600 hover:underline">
        ← All contracts
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Contract · version {contract.version}</p>
          <h1 className="mt-1 font-mono text-2xl font-semibold tracking-tight text-ink-900">
            {contract.id}
          </h1>
        </div>
        <StatusBadge status={contract.status} className="text-sm" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card className="p-5">
            <SectionHeading eyebrow="What is agreed" title="Contract terms" />

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
                label="Issued"
                value={contract.issuedAt ? formatDateTime(contract.issuedAt) : 'Not yet issued'}
                mono
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
                    <td className="py-2.5 text-ink-900">{item.productName}</td>
                    <td className="py-2.5 text-ink-600">{item.assetName ?? 'Allocated on booking'}</td>
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
            <SectionHeading
              eyebrow="Progress"
              title="Service timeline"
              action={
                contract.campaign ? <StatusBadge status={contract.campaign.status} /> : undefined
              }
            />

            {contract.timeline.length === 0 ? (
              <p className="text-sm text-ink-500">
                Updates will appear here as your campaign progresses.
              </p>
            ) : (
              <ol className="space-y-4">
                {contract.timeline.map((event) => (
                  <li key={event.id} className="flex gap-4">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500"
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs tabular text-ink-500">
                        {formatDateTime(event.at)}
                      </p>
                      <p className="mt-0.5 text-sm text-ink-900">{event.summary}</p>

                      {event.proofs.length > 0 ? (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {event.proofs.map((proof) => (
                            <li key={proof.id}>
                              <a
                                href={`/api/proof/${proof.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-control border border-ink-300 px-2.5 py-1 text-xs text-ink-700 hover:border-brand-500 hover:text-brand-700"
                              >
                                View proof · {proof.fileName}
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <ContractActions
            contractId={contract.id}
            canAccept={contract.canAccept}
            canRequestChange={contract.canRequestChange}
            status={contract.status}
          />

          {contract.pendingRequests.length > 0 ? (
            <Card className="p-5">
              <SectionHeading eyebrow="With the team" title="Your requests" />
              <ul className="space-y-3">
                {contract.pendingRequests.map((request) => (
                  <li key={request.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink-800">
                        {humanise(request.type)}
                      </span>
                      <StatusBadge status={request.status} />
                    </div>
                    <p className="mt-1 text-sm text-ink-600">{request.summary}</p>
                    <p className="mt-1 font-mono text-xs tabular text-ink-400">
                      {formatDateTime(request.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <Notice tone="info" title="Pending review">
                  A change or cancellation is only agreed once the team confirms it here.
                </Notice>
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
