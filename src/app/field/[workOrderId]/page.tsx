import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/server/db'
import { getSession } from '@/server/session'
import { getWorkOrderForFitter } from '@/server/services/fieldWork'
import { ApiError } from '@/server/errors'
import { Card, DataPoint, EmptyState, Notice, StatusBadge } from '@/ui/primitives'
import { formatDate, formatDateTime, formatTime, humanise } from '@/ui/format'
import { JobActions } from '@/ui/JobActions'

export default async function FieldJobPage({
  params,
}: {
  params: Promise<{ workOrderId: string }>
}) {
  const session = await getSession()
  const { workOrderId } = await params

  if (!session || session.role !== 'fitter') {
    return (
      <EmptyState
        title="Sign in as a fitter"
        description="Use the account switcher above to sign in as the seeded fitter."
      />
    )
  }

  // Scoped by assigned user: a job belonging to another fitter is not found,
  // so the depot access notes on it are never rendered here.
  const job = await getWorkOrderForFitter(prisma, workOrderId, session.userId).catch((error) => {
    if (error instanceof ApiError && error.code === 'not_found') notFound()
    throw error
  })

  return (
    <div className="space-y-5">
      <Link href="/field" className="text-sm text-brand-600">
        ← All jobs
      </Link>

      <div>
        <p className="eyebrow">{job.campaign.name}</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink-900">
          {humanise(job.type)}
        </h1>
        <p className="mt-2">
          <StatusBadge status={job.status} className="text-sm" />
        </p>
      </div>

      <Card className="p-4">
        <dl className="space-y-3">
          <DataPoint label="Where" value={job.locationLabel} />
          {job.asset ? <DataPoint label="Asset" value={job.asset.name} mono /> : null}
          <DataPoint
            label="When"
            value={`${formatDate(job.scheduledStart.toISOString().slice(0, 10))}, ${formatTime(
              job.scheduledStart,
            )}–${formatTime(job.scheduledEnd)}`}
            mono
          />
        </dl>
      </Card>

      <Card className="p-4">
        <p className="eyebrow">What to do</p>
        <p className="mt-1.5 text-ink-900">{job.instructions}</p>

        {job.internalNotes ? (
          <div className="mt-3 rounded-control bg-ink-50 p-3">
            <p className="eyebrow">Office notes · not shown to the client</p>
            <p className="mt-1 text-sm text-ink-700">{job.internalNotes}</p>
          </div>
        ) : null}
      </Card>

      {job.status === 'blocked' && job.blockedReason ? (
        <Notice tone="critical" title="You marked this blocked">
          {job.blockedReason}
        </Notice>
      ) : null}

      <JobActions
        workOrderId={job.id}
        status={job.status}
        proofs={job.proofRecords.map((p) => ({
          id: p.id,
          fileName: p.fileName,
          sizeBytes: p.sizeBytes,
        }))}
        completionNote={job.completionNote}
      />

      {job.history.length > 0 ? (
        <Card className="p-4">
          <p className="eyebrow">Job history</p>
          <ol className="mt-2 space-y-2">
            {job.history.map((event) => (
              <li key={event.id} className="text-sm">
                <span className="font-mono text-xs tabular text-ink-500">
                  {formatDateTime(event.at)}
                </span>{' '}
                <span className="font-medium text-ink-900">{humanise(event.action)}</span>
                {event.note ? <p className="text-ink-600">{event.note}</p> : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </div>
  )
}
