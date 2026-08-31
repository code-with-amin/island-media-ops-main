import Link from 'next/link'
import { prisma } from '@/server/db'
import { getSession } from '@/server/session'
import { getClientSummary } from '@/server/services/clientPortal'
import { listShortlist } from '@/server/services/shortlist'
import { Card, DataPoint, EmptyState, Notice, SectionHeading, StatusBadge } from '@/ui/primitives'
import { AnswerEnquiryForm } from '@/ui/AnswerEnquiryForm'
import { formatDateTime, formatMoney, formatRange } from '@/ui/format'

/**
 * The portal home.
 *
 * The brief singles this out: an account with no contracts must have a useful
 * home, not a broken or empty one. So the page is ordered by what the client
 * can do next — anything waiting on them first, then what they have already
 * asked us about, then a way back into the catalogue — and the no-contract
 * case gets a real invitation rather than an apology.
 */
export default async function PortalHome() {
  const session = await getSession()

  if (!session || session.role !== 'client' || !session.organisationId) {
    return (
      <EmptyState
        title="Sign in to see your account"
        description="Use the account switcher above to sign in as a seeded client, or create a new account. You do not need a contract with us to sign up."
        action={
          <Link
            href="/register"
            className="rounded-control bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Create an account
          </Link>
        }
      />
    )
  }

  const [summary, shortlist] = await Promise.all([
    getClientSummary(prisma, session.organisationId),
    listShortlist(prisma, session.organisationId),
  ])

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Client account</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">
          {summary.organisation.name}
        </h1>
      </div>

      {summary.actionsRequired.length > 0 ? (
        <section>
          <SectionHeading eyebrow="Needs you" title="Waiting on you" />
          <div className="space-y-2">
            {summary.actionsRequired.map((action) => (
              <Card key={action.id} className="p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900">{action.label}</p>
                    <p className="font-mono text-xs tabular text-ink-500">{action.id}</p>
                  </div>
                  {action.kind === 'contract' ? (
                    <Link
                      href={`/portal/contracts/${action.id}`}
                      className="rounded-control bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                    >
                      Review contract
                    </Link>
                  ) : null}
                </div>

                {action.kind === 'booking_request' ? (
                  <AnswerEnquiryForm requestId={action.id} question={action.detail} />
                ) : null}
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeading
          eyebrow="Agreements"
          title="Your contracts"
          action={
            summary.hasContracts ? (
              <Link href="/portal/contracts" className="text-sm text-brand-600 hover:underline">
                See all
              </Link>
            ) : null
          }
        />

        {!summary.hasContracts ? (
          <EmptyState
            title="No contracts yet"
            description="When you book advertising with us, the contract appears here along with its campaign progress and proof of installation. Nothing here yet is normal for a new account."
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
            {summary.contracts.map((contract) => (
              <Card as="li" key={contract.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/portal/contracts/${contract.id}`}
                    className="font-mono text-sm font-medium text-ink-900 hover:text-brand-600"
                  >
                    {contract.id}
                  </Link>
                  <p className="mt-0.5 font-mono text-xs tabular text-ink-500">
                    {formatRange(contract.startDate, contract.endDate)}
                  </p>
                </div>
                <span className="font-mono text-sm tabular text-ink-800">
                  {formatMoney(contract.total)}
                </span>
                <StatusBadge status={contract.status} />
              </Card>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionHeading eyebrow="Enquiries" title="What you have asked us about" />

        {summary.bookingRequests.length === 0 ? (
          <EmptyState
            title="No enquiries yet"
            description="Find media that suits your dates and send a non-binding enquiry. We will come back to you with availability and a price."
            action={
              <Link
                href="/"
                className="rounded-control border border-ink-300 px-4 py-2 text-sm font-medium text-ink-800 hover:border-brand-500"
              >
                Browse media
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2">
            {summary.bookingRequests.map((request) => (
              <Card as="li" key={request.id} className="p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-900">{request.productName}</p>
                    <p className="mt-0.5 font-mono text-xs tabular text-ink-500">
                      {formatRange(request.startDate, request.endDate)}
                    </p>
                  </div>
                  <span className="text-xs text-ink-500">
                    {request.awaitingYou ? 'Waiting on you' : 'With the team'}
                  </span>
                  <StatusBadge status={request.status} />
                </div>

                {request.awaitingYou ? (
                  <p className="mt-2 text-xs text-ink-500">
                    The team have asked you a question — answer it at the top of this page.
                  </p>
                ) : null}
              </Card>
            ))}
          </ul>
        )}

        {summary.bookingRequests.some((r) => r.status === 'submitted') ? (
          <div className="mt-3">
            <Notice tone="info" title="An enquiry is not a booking">
              Nothing is reserved until we issue a contract and you accept it.
            </Notice>
          </div>
        ) : null}
      </section>

      {shortlist.length > 0 ? (
        <section>
          <SectionHeading eyebrow="Saved" title="Your shortlist" />
          <ul className="space-y-2">
            {shortlist.map((item) => (
              <Card as="li" key={item.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <Link
                    href={{
                      pathname: `/products/${item.productId}`,
                      query:
                        item.startDate && item.endDate
                          ? { startDate: item.startDate, endDate: item.endDate }
                          : {},
                    }}
                    className="font-medium text-ink-900 hover:text-brand-600"
                  >
                    {item.product.name}
                  </Link>
                  <p className="mt-0.5 font-mono text-xs tabular text-ink-500">
                    {item.startDate && item.endDate
                      ? formatRange(item.startDate, item.endDate)
                      : 'No dates saved'}
                  </p>
                </div>
                <span className="font-mono text-xs tabular text-ink-600">
                  {item.product.rateLabel}
                </span>
              </Card>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.recentEvents.length > 0 ? (
        <section>
          <SectionHeading eyebrow="Progress" title="Recent updates" />
          <Card className="divide-y divide-ink-100">
            {summary.recentEvents.map((event) => (
              <div key={event.id} className="flex flex-wrap gap-x-4 gap-y-1 p-4">
                <span className="font-mono text-xs tabular text-ink-500">
                  {formatDateTime(event.at)}
                </span>
                <p className="min-w-0 flex-1 text-sm text-ink-800">{event.summary}</p>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <DataPoint
        label="Account"
        value={`${session.name} · ${summary.organisation.name}`}
      />
    </div>
  )
}
