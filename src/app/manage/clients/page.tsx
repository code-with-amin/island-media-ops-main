import Link from 'next/link'
import { prisma } from '@/server/db'
import { listClients } from '@/server/services/management'
import { Badge, Card, SectionHeading } from '@/ui/primitives'
import { formatDate } from '@/ui/format'

export default async function ClientsPage() {
  const clients = await listClients(prisma)

  return (
    <div className="space-y-6">
      <SectionHeading eyebrow="Accounts" title="Clients" />

      <ul className="space-y-2">
        {clients.map((client) => (
          <Card as="li" key={client.id} className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/manage/clients/${client.id}`}
                  className="font-medium text-ink-900 hover:text-brand-600"
                >
                  {client.name}
                </Link>
                <p className="mt-0.5 text-sm text-ink-600">
                  {client.users.map((u) => u.name).join(', ') || 'No users'}
                </p>
              </div>
              <span className="font-mono text-xs tabular text-ink-500">
                joined {formatDate(client.createdAt.toISOString().slice(0, 10))}
              </span>
              {client.contracts.length === 0 ? (
                <Badge tone="neutral">No contracts</Badge>
              ) : (
                <Badge tone="positive">
                  {client.contracts.length} contract{client.contracts.length === 1 ? '' : 's'}
                </Badge>
              )}
              {client.bookingRequests.length > 0 ? (
                <Badge tone="info">{client.bookingRequests.length} enquiries</Badge>
              ) : null}
            </div>
          </Card>
        ))}
      </ul>
    </div>
  )
}
