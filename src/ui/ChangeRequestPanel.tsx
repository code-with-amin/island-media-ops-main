'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Card, ErrorNotice, Field, Notice, SectionHeading, inputClass } from './primitives'
import { formatDateTime } from './format'

/**
 * Answering a client's change request.
 *
 * The client's words are shown in full beside the form, because deciding
 * without reading what was asked is how the wrong change gets made.
 *
 * Revising produces a new version, since a changed offer is a different offer
 * and the client should accept the one they can see. Declining hands the same
 * version back with a reason. Both are answers; only one is a new offer.
 */
export function ChangeRequestPanel({
  contractId,
  startDate,
  endDate,
  requests,
}: {
  contractId: string
  startDate: string
  endDate: string
  requests: { id: string; summary: string; createdAt: Date | string }[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'revise' | 'decline'>('revise')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null)

  async function respond(body: Record<string, unknown>) {
    setError(null)
    setPending(true)

    let response: Response
    try {
      response = await fetch(`/api/management/contracts/${contractId}/change-request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      setPending(false)
      setError({ message: 'That did not send.', details: ['Check your connection and try again.'] })
      return
    }

    setPending(false)

    if (response.ok) {
      router.refresh()
      return
    }

    const parsed = await response.json().catch(() => null)
    setError({
      message: parsed?.message ?? 'That could not be saved.',
      details: parsed?.details ?? [],
    })
  }

  return (
    <Card className="border-caution/40 p-5">
      <SectionHeading eyebrow="Needs a decision" title="The client asked for a change" />

      {requests.map((request) => (
        <div key={request.id} className="mb-3 rounded-control bg-caution-soft p-3">
          <p className="text-sm text-ink-900">{request.summary}</p>
          <p className="mt-1 font-mono text-xs tabular text-ink-500">
            {formatDateTime(request.createdAt)}
          </p>
        </div>
      ))}

      {error ? (
        <div className="mb-3">
          <ErrorNotice title={error.message} details={error.details} />
        </div>
      ) : null}

      <div className="mb-4 flex gap-2">
        {(['revise', 'decline'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            className={`flex-1 rounded-control border px-3 py-1.5 text-sm font-medium ${
              mode === option
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-ink-300 text-ink-700 hover:border-brand-400'
            }`}
          >
            {option === 'revise' ? 'Revise and re-issue' : 'Decline the change'}
          </button>
        ))}
      </div>

      {mode === 'revise' ? (
        <form
          action={async (formData) => {
            await respond({
              action: 'revise',
              startDate: formData.get('startDate'),
              endDate: formData.get('endDate'),
              note: formData.get('note'),
            })
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <input type="date" name="startDate" defaultValue={startDate} className={inputClass} />
            </Field>
            <Field label="Until">
              <input type="date" name="endDate" defaultValue={endDate} className={inputClass} />
            </Field>
          </div>

          <Field label="What changed" hint="Recorded in the history and shown to the client">
            <textarea
              name="note"
              rows={2}
              required
              placeholder="End date brought back a month as requested."
              className={inputClass}
            />
          </Field>

          <Notice tone="info" title="This creates a new version">
            The total is recalculated from the new period, and the dates are rechecked against
            inventory before anything is saved.
          </Notice>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-control bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? 'Checking and re-issuing…' : 'Revise and re-issue'}
          </button>
        </form>
      ) : (
        <form
          action={async (formData) => {
            await respond({ action: 'decline', note: formData.get('note') })
          }}
          className="space-y-3"
        >
          <Field label="Why not" hint="The client sees this">
            <textarea
              name="note"
              rows={2}
              required
              placeholder="The panel is committed elsewhere from May."
              className={inputClass}
            />
          </Field>

          <Notice tone="caution" title="The terms stand">
            The contract goes back to the client unchanged, on the same version, for them to
            accept or query again.
          </Notice>

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-control border border-critical/40 px-4 py-2.5 text-sm font-medium text-critical hover:bg-critical-soft disabled:opacity-60"
          >
            {pending ? 'Sending…' : 'Decline and return the contract'}
          </button>
        </form>
      )}
    </Card>
  )
}
