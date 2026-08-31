import Link from 'next/link'
import { prisma } from '@/server/db'
import { getSession } from '@/server/session'
import { listWorkOrdersForFitter } from '@/server/services/fieldWork'
import { today } from '@/domain/clock'
import { Card, EmptyState, StatusBadge } from '@/ui/primitives'
import { formatDate, formatTime, humanise } from '@/ui/format'

/**
 * The fitter's job list.
 *
 * Split into today and later, because on any given morning that is the only
 * distinction that matters. Completed jobs stay visible but drop to the
 * bottom: a fitter needs to be able to check what they already did without
 * digging for it.
 */
export default async function FieldJobsPage() {
  const session = await getSession()

  if (!session || session.role !== 'fitter') {
    return (
      <EmptyState
        title="Sign in as a fitter"
        description="Use the account switcher above to sign in as Casey Morgan, the seeded fitter."
      />
    )
  }

  const jobs = await listWorkOrdersForFitter(prisma, session.userId)
  const now = today()

  const isToday = (d: Date) => d.toISOString().slice(0, 10) === now
  const open = jobs.filter((j) => j.status !== 'completed')
  const groups = [
    { key: 'today', title: 'Today', jobs: open.filter((j) => isToday(j.scheduledStart)) },
    { key: 'upcoming', title: 'Coming up', jobs: open.filter((j) => !isToday(j.scheduledStart)) },
    { key: 'done', title: 'Completed', jobs: jobs.filter((j) => j.status === 'completed') },
  ].filter((g) => g.jobs.length > 0)

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">{formatDate(now)}</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink-900">
          Hello, {session.name.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          {open.length === 0
            ? 'Nothing assigned to you right now.'
            : `${open.length} job${open.length === 1 ? '' : 's'} to do.`}
        </p>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          title="No jobs assigned"
          description="When the office schedules an installation for you, it appears here with the address and what to do."
        />
      ) : (
        groups.map((group) => (
          <section key={group.key}>
            <h2 className="eyebrow mb-2">{group.title}</h2>
            <ul className="space-y-2">
              {group.jobs.map((job) => (
                <Card as="li" key={job.id}>
                  <Link href={`/field/${job.id}`} className="block p-4 active:bg-ink-50">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink-900">{humanise(job.type)}</p>
                        <p className="mt-0.5 text-sm text-ink-600">{job.locationLabel}</p>
                        {job.asset ? (
                          <p className="mt-0.5 font-mono text-xs tabular text-ink-500">
                            {job.asset.name}
                          </p>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm tabular text-ink-900">
                          {formatTime(job.scheduledStart)}
                        </p>
                        <p className="mt-1">
                          <StatusBadge status={job.status} />
                        </p>
                      </div>
                    </div>
                  </Link>
                </Card>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
