'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Card, ErrorNotice, Field, Notice, SectionHeading, inputClass } from './primitives'

/**
 * The approval decision.
 *
 * Approve is offered even when availability looks poor, because the server is
 * the authority, not this panel: it rechecks inside the transaction and
 * refuses with the blocking records. Hiding the button would make the page
 * lie about who decides, and would hide the conflict a manager needs to see.
 *
 * Once approved, the same panel drafts and issues the contract, so the whole
 * path from enquiry to issued contract happens on one screen.
 */
export function RequestDecisionPanel({
  requestId,
  isDecided,
  status,
  available,
  meetsMinimumTerm,
  hasOrganisation,
  availableAssets,
  allocationModel,
  existingContract,
}: {
  requestId: string
  isDecided: boolean
  status: string
  available: boolean
  meetsMinimumTerm: boolean
  hasOrganisation: boolean
  availableAssets: { id: string; name: string }[]
  allocationModel: string
  /** Set once this request has produced a contract. A request makes at most one. */
  existingContract: { id: string; status: string } | null
}) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null)

  const contractKey = useRef(
    `contract-${requestId}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
  )

  async function send(
    label: string,
    url: string,
    init: RequestInit,
  ): Promise<Record<string, unknown> | null> {
    setError(null)
    setPending(label)

    const response = await fetch(url, init)
    setPending(null)

    if (response.ok) {
      router.refresh()
      return (await response.json().catch(() => null)) as Record<string, unknown> | null
    }

    const body = await response.json().catch(() => null)
    setError({
      message: body?.message ?? 'That could not be saved.',
      details: body?.details ?? ['Check your connection and try again.'],
    })
    return null
  }

  const decide = (label: string, body: Record<string, unknown>) =>
    send(label, `/api/management/booking-requests/${requestId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

  const draftContract = (assetId: string | null) =>
    send('draft', '/api/management/contracts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Idempotency-Key': contractKey.current },
      body: JSON.stringify({ bookingRequestId: requestId, assetId }),
    })

  const issue = (contractId: string) =>
    send('issue', `/api/management/contracts/${contractId}/issue`, { method: 'POST' })

  // ---------------------------------------------------------- after approval

  // A contract already exists for this request. Driven from the server rather
  // than local state, so it is still correct after a reload — and so the panel
  // cannot offer a second draft, which the server refuses anyway.
  if (existingContract) {
    const isDraft = existingContract.status === 'draft'

    return (
      <Card className="p-5">
        <SectionHeading
          eyebrow="Approved"
          title={isDraft ? 'Draft contract created' : 'Contract created'}
        />

        {error ? (
          <div className="mb-3">
            <ErrorNotice title={error.message} details={error.details} />
          </div>
        ) : null}

        {isDraft ? (
          <div className="space-y-3">
            <Notice tone="info" title="Not visible to the client yet">
              Issuing puts it in their portal to accept or query.
            </Notice>
            <button
              type="button"
              disabled={pending !== null}
              onClick={() => issue(existingContract.id)}
              className="w-full rounded-control bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending === 'issue' ? 'Issuing…' : 'Issue contract to client'}
            </button>
          </div>
        ) : (
          <Notice tone="positive" title="Contract issued">
            The client can review and accept it in their portal.
          </Notice>
        )}

        <p className="mt-4 text-sm text-ink-600">
          A request produces one contract; changes are made by re-issuing that one.
        </p>

        <a
          href={`/manage/contracts/${existingContract.id}`}
          className="mt-3 block rounded-control border border-ink-300 px-4 py-2 text-center text-sm font-medium text-ink-800 hover:border-brand-500 hover:text-brand-700"
        >
          Open the contract →
        </a>
      </Card>
    )
  }

  // Approved, and no contract drafted yet: allocate an asset and draft one.
  if (status === 'approved') {
    return (
      <Card className="p-5">
        <SectionHeading eyebrow="Approved" title="Turn this into a contract" />

        {error ? (
          <div className="mb-3">
            <ErrorNotice title={error.message} details={error.details} />
          </div>
        ) : null}

        {!hasOrganisation ? (
          <Notice tone="caution" title="No client account attached">
            This enquiry came in without an account, so there is nobody to issue a contract to.
          </Notice>
        ) : (
          <form
            action={async (formData) => {
              await draftContract((formData.get('assetId') as string) || null)
            }}
            className="space-y-3"
          >
            {allocationModel === 'exclusive_asset' ? (
              <Field label="Allocate an asset" hint="Only assets free for these dates are listed">
                <select name="assetId" required className={inputClass}>
                  <option value="">Choose an asset</option>
                  {availableAssets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <p className="text-sm text-ink-600">
                This product is sold from a shared pool, so no named asset is allocated.
              </p>
            )}

            <button
              type="submit"
              disabled={pending !== null}
              className="w-full rounded-control bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending === 'draft' ? 'Creating…' : 'Create draft contract'}
            </button>
          </form>
        )}
      </Card>
    )
  }

  if (isDecided) {
    return (
      <Card className="p-5">
        <SectionHeading eyebrow="Closed" title={`This request was ${status}`} />
        <p className="text-sm text-ink-600">
          The history below records who decided and why. Reopening is not part of this prototype.
        </p>
      </Card>
    )
  }

  // ------------------------------------------------------------- undecided

  return (
    <Card className="p-5">
      <SectionHeading eyebrow="Your call" title="Decide this request" />

      {!available || !meetsMinimumTerm ? (
        <div className="mb-3">
          <Notice tone="caution" title="Approving will be checked again">
            {!available
              ? 'Nothing is currently free for these dates. If you approve, the server rechecks and will refuse with the blocking records.'
              : 'Inventory is free, but the requested period is shorter than the minimum term.'}
          </Notice>
        </div>
      ) : null}

      {error ? <div className="mb-3"><ErrorNotice title={error.message} details={error.details} /></div> : null}

      <div className="space-y-3">
        <form
          action={async (formData) => {
            await decide('approve', {
              decision: 'approve',
              assetId: (formData.get('assetId') as string) || null,
            })
          }}
          className="space-y-3"
        >
          {allocationModel === 'exclusive_asset' && availableAssets.length > 0 ? (
            <Field label="Allocate an asset" hint="Optional now, required before the contract">
              <select name="assetId" className={inputClass}>
                <option value="">Decide later</option>
                {availableAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <button
            type="submit"
            disabled={pending !== null}
            className="w-full rounded-control bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending === 'approve' ? 'Checking availability…' : 'Approve request'}
          </button>
        </form>

        <form
          action={async (formData) => {
            await decide('info', { decision: 'request_information', note: formData.get('note') })
          }}
          className="space-y-2 border-t border-ink-100 pt-3"
        >
          <Field label="Ask the client for more" hint="They will see this note on their request">
            <textarea
              name="note"
              rows={2}
              required
              placeholder="Could you confirm your preferred start date?"
              className={inputClass}
            />
          </Field>
          <button
            type="submit"
            disabled={pending !== null}
            className="w-full rounded-control border border-ink-300 px-4 py-2 text-sm font-medium text-ink-800 hover:border-brand-500 disabled:opacity-60"
          >
            {pending === 'info' ? 'Sending…' : 'Request more information'}
          </button>
        </form>

        <form
          action={async (formData) => {
            await decide('decline', { decision: 'decline', note: formData.get('note') })
          }}
          className="space-y-2 border-t border-ink-100 pt-3"
        >
          <Field label="Or decline" hint="Recorded in the history with your reason">
            <input
              name="note"
              required
              placeholder="Below the minimum term for this product"
              className={inputClass}
            />
          </Field>
          <button
            type="submit"
            disabled={pending !== null}
            className="w-full rounded-control border border-critical/40 px-4 py-2 text-sm font-medium text-critical hover:bg-critical-soft disabled:opacity-60"
          >
            {pending === 'decline' ? 'Declining…' : 'Decline request'}
          </button>
        </form>
      </div>
    </Card>
  )
}
