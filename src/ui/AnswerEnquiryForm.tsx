'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ErrorNotice, Field, inputClass } from './primitives'

/**
 * Answering the agency's question about an enquiry.
 *
 * The question is shown in full beside the box, because asking someone to
 * reply to a message they cannot see is the actual failure this replaces.
 */
export function AnswerEnquiryForm({
  requestId,
  question,
}: {
  requestId: string
  question: string | null
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null)

  async function answer(formData: FormData) {
    setError(null)
    setPending(true)

    let response: Response
    try {
      response = await fetch(`/api/client/booking-requests/${requestId}/respond`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answer: formData.get('answer') }),
      })
    } catch {
      setPending(false)
      setError({ message: 'Your answer did not send.', details: ['Check your connection and try again.'] })
      return
    }

    setPending(false)

    if (response.ok) {
      router.refresh()
      return
    }

    const body = await response.json().catch(() => null)
    setError({
      message: body?.message ?? 'Your answer could not be sent.',
      details: body?.details ?? [],
    })
  }

  return (
    <div className="mt-3 rounded-control border border-caution/30 bg-caution-soft p-4">
      <p className="eyebrow">The team asked</p>
      <p className="mt-1 text-sm text-ink-900">
        {question ?? 'They need a little more information before they can proceed.'}
      </p>

      <form action={answer} className="mt-3 space-y-2">
        <Field label="Your answer">
          <textarea
            name="answer"
            rows={2}
            required
            placeholder="Artwork will be ready by 22 January."
            className={inputClass}
          />
        </Field>

        {error ? <ErrorNotice title={error.message} details={error.details} /> : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-control bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? 'Sending…' : 'Send answer'}
        </button>
      </form>
    </div>
  )
}
