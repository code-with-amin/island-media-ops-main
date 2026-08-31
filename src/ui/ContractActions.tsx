'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Card, ErrorNotice, Field, Notice, SectionHeading, inputClass } from './primitives'

/**
 * Client decisions on an issued contract.
 *
 * Two things this must never do. It must not imply that a change has been
 * agreed — a change request goes to the team and stays pending until they act.
 * And it must not let a client edit the contract: accepting or requesting a
 * change moves the status and records history, and the issued terms stand
 * until a manager issues a new version.
 *
 * Acceptance can fail with a 409 when inventory has gone since the contract
 * was issued. That is a real outcome, not an edge case, so it is shown
 * plainly rather than swallowed.
 */
export function ContractActions({
  contractId,
  canAccept,
  canRequestChange,
  status,
}: {
  contractId: string
  canAccept: boolean
  canRequestChange: boolean
  status: string
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'idle' | 'requesting'>('idle')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null)

  async function act(body: Record<string, unknown>) {
    setError(null)
    setPending(true)

    const response = await fetch(`/api/client/contracts/${contractId}/actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (response.ok) {
      setMode('idle')
      setPending(false)
      router.refresh()
      return
    }

    const parsed = await response.json().catch(() => null)
    setError({
      message: parsed?.message ?? 'That could not be saved.',
      details: parsed?.details ?? ['Check your connection and try again.'],
    })
    setPending(false)
  }

  if (!canAccept && !canRequestChange) {
    return (
      <Card className="p-5">
        <SectionHeading eyebrow="Status" title="Nothing to decide" />
        <p className="text-sm text-ink-600">
          {status === 'change_requested'
            ? 'Your change request is with the team. They will send a new version if it can be accommodated.'
            : status === 'active'
              ? 'This contract is active. Progress appears in the timeline.'
              : `This contract is ${status.replace(/_/g, ' ')}.`}
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <SectionHeading eyebrow="Needs you" title="Review this contract" />

      <p className="text-sm text-ink-600">
        Accepting confirms the dates and the total above, and we will start booking the
        inventory.
      </p>

      {error ? <div className="mt-3"><ErrorNotice title={error.message} details={error.details} /></div> : null}

      {mode === 'idle' ? (
        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled={pending || !canAccept}
            onClick={() => act({ action: 'accept' })}
            className="w-full rounded-control bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? 'Accepting…' : 'Accept this contract'}
          </button>

          <button
            type="button"
            disabled={pending || !canRequestChange}
            onClick={() => setMode('requesting')}
            className="w-full rounded-control border border-ink-300 px-4 py-2.5 text-sm font-medium text-ink-800 hover:border-brand-500 hover:text-brand-700 disabled:opacity-60"
          >
            Request a change
          </button>

          <p className="pt-1 text-xs text-ink-500">
            This is a prototype acceptance, not an electronic signature.
          </p>
        </div>
      ) : (
        <form
          action={(formData) =>
            act({ action: 'request_change', note: formData.get('note') })
          }
          className="mt-4 space-y-3"
        >
          <Field label="What needs to change?" hint="The team will reply with a new version if they can">
            <textarea
              name="note"
              rows={3}
              required
              placeholder="Please move the start date to 15 February."
              className={inputClass}
            />
          </Field>

          <Notice tone="caution" title="Nothing changes yet">
            Your current contract stays exactly as it is until the team issues a new version.
          </Notice>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-control bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? 'Sending…' : 'Send request'}
            </button>
            <button
              type="button"
              onClick={() => setMode('idle')}
              className="rounded-control border border-ink-300 px-4 py-2 text-sm font-medium text-ink-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </Card>
  )
}
