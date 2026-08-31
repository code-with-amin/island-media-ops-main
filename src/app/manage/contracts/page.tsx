import Link from 'next/link'
import { prisma } from '@/server/db'
import { listContracts } from '@/server/services/management'
import { Card, EmptyState, SectionHeading, StatusBadge } from '@/ui/primitives'
import { formatMoney, formatRange } from '@/ui/format'

export default async function ManageContractsPage() {
  const contracts = await listContracts(prisma)

  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Agreements" title="Contracts" />

      {contracts.length === 0 ? (
        <EmptyState
          title="No contracts yet"
          description="Approve a booking request to draft the first one."
        />
      ) : (
        <ul className="space-y-2">
          {contracts.map((contract) => (
            <Card as="li" key={contract.id} className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/manage/contracts/${contract.id}`}
                    className="font-medium text-ink-900 hover:text-brand-600"
                  >
                    {contract.organisation.name}
                  </Link>
                  <p className="mt-0.5 text-sm text-ink-600">
                    {contract.items.map((i) => i.product.name).join(', ')}
                  </p>
                  <p className="font-mono text-xs tabular text-ink-400">
                    {contract.id} · version {contract.version}
                  </p>
                </div>
                <span className="font-mono text-xs tabular text-ink-600">
                  {formatRange(contract.startDate, contract.endDate)}
                </span>
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
