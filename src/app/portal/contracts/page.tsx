import Link from 'next/link'
import { prisma } from '@/server/db'
import { getSession } from '@/server/session'
import { listClientContracts } from '@/server/services/clientPortal'
import { Card, EmptyState, SectionHeading, StatusBadge } from '@/ui/primitives'
import { formatMoney, formatRange } from '@/ui/format'

export default async function ContractsPage() {
  const session = await getSession()

  if (!session || session.role !== 'client' || !session.organisationId) {
    return (
      <EmptyState
        title="Sign in to see your contracts"
        description="Use the account switcher above to sign in as a client account."
      />
    )
  }

  const contracts = await listClientContracts(prisma, session.organisationId)

  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Agreements" title="Your contracts" />

      {contracts.length === 0 ? (
        <EmptyState
          title="No contracts yet"
          description="Contracts appear here once we have issued one to you. You can browse and enquire without one."
          action={
            <Link
              href="/"
              className="rounded-control bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Browse available media
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2">
          {contracts.map((contract) => (
            <Card as="li" key={contract.id} className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/portal/contracts/${contract.id}`}
                    className="font-mono text-sm font-medium text-ink-900 hover:text-brand-600"
                  >
                    {contract.id}
                  </Link>
                  <p className="mt-0.5 text-sm text-ink-600">
                    {contract.items.map((i) => i.product.name).join(', ')}
                  </p>
                  <p className="mt-0.5 font-mono text-xs tabular text-ink-500">
                    {formatRange(contract.startDate, contract.endDate)} · version {contract.version}
                  </p>
                </div>
                <span className="font-mono text-sm tabular text-ink-800">
                  {formatMoney(contract.total, contract.currency)}
                </span>
                <StatusBadge status={contract.status} />
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  )
}
