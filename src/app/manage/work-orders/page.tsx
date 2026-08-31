import { prisma } from '@/server/db'
import { Card, EmptyState, SectionHeading, StatusBadge } from '@/ui/primitives'
import { formatDateTime, humanise } from '@/ui/format'
import { WorkOrderCreator } from '@/ui/WorkOrderCreator'

/**
 * Field work.
 *
 * Creating a job here is what puts it on a fitter's phone, so the form lives
 * beside the list rather than behind a separate screen — the manager creating
 * the work is usually the manager watching it.
 */
export default async function WorkOrdersPage() {
  const [workOrders, campaigns, fitters] = await Promise.all([
    prisma.workOrder.findMany({
      include: { assignedUser: true, asset: true, campaign: true, proofRecords: true },
      orderBy: { scheduledStart: 'asc' },
    }),
    prisma.campaign.findMany({
      where: { contract: { status: { in: ['accepted', 'active'] } } },
      include: { contract: { include: { organisation: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({ where: { role: 'fitter', status: 'active' }, orderBy: { name: 'asc' } }),
  ])

  const assets = await prisma.asset.findMany({
    where: { status: 'active' },
    orderBy: { name: 'asc' },
  })

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <SectionHeading eyebrow="Operations" title="Field work" />

        {workOrders.length === 0 ? (
          <EmptyState
            title="No field work yet"
            description="Create an installation against an accepted contract to get it onto a fitter's phone."
          />
        ) : (
          <ul className="space-y-2">
            {workOrders.map((job) => (
              <Card as="li" key={job.id} className="p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900">
                      {humanise(job.type)} · {job.campaign.name}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-600">
                      {job.locationLabel}
                      {job.asset ? ` · ${job.asset.name}` : ''}
                    </p>
                    <p className="font-mono text-xs tabular text-ink-400">{job.id}</p>
                  </div>
                  <span className="font-mono text-xs tabular text-ink-600">
                    {formatDateTime(job.scheduledStart)}
                  </span>
                  <span className="text-sm text-ink-600">
                    {job.assignedUser?.name ?? 'Unassigned'}
                  </span>
                  <StatusBadge status={job.status} />
                </div>

                {job.status === 'blocked' && job.blockedReason ? (
                  <p className="mt-2 rounded-control bg-critical-soft px-3 py-2 text-sm text-critical">
                    Blocked: {job.blockedReason}
                  </p>
                ) : null}

                {job.status === 'completed' ? (
                  <div className="mt-2 border-t border-ink-100 pt-2">
                    <p className="text-sm text-ink-700">{job.completionNote}</p>
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
                  </div>
                ) : null}
              </Card>
            ))}
          </ul>
        )}
      </div>

      <aside>
        <WorkOrderCreator
          campaigns={campaigns.map((c) => ({
            id: c.id,
            label: `${c.contract.organisation.name} — ${c.name}`,
          }))}
          fitters={fitters.map((f) => ({ id: f.id, name: f.name }))}
          assets={assets.map((a) => ({ id: a.id, name: a.name }))}
        />
      </aside>
    </div>
  )
}
