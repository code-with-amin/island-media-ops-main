'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { ErrorNotice, Field, Notice, inputClass } from './primitives'
import { formatRange } from './format'

/**
 * Shortlist and enquiry.
 *
 * Two rules shape this panel. A request is non-binding and says so, because
 * the client portal must never imply that anything is agreed before management
 * has changed the underlying state. And an unavailable product can still be
 * enquired about: refusing to record the enquiry would hide real demand from
 * the agency, and the client may be flexible on dates.
 */
export function RequestPanel({
  productId,
  productName,
  range,
  available,
  isSignedInClient,
}: {
  productId: string
  productName: string
  range: { startDate: string; endDate: string }
  available: boolean
  isSignedInClient: boolean
}) {
  const router = useRouter()
  const [state, setState] = useState<'idle' | 'saving' | 'submitted'>('idle')
  const [shortlisted, setShortlisted] = useState(false)
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null)

  /**
   * Generated once per mounted form, not per click. If the network drops and
   * the client presses submit again, the retry carries the same key and the
   * server returns the request it already created instead of a second one.
   */
  const idempotencyKey = useRef(
    `req-${productId}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
  )

  async function addToShortlist() {
    setError(null)
    const response = await fetch('/api/client/shortlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId, ...range }),
    })
    if (response.ok) {
      setShortlisted(true)
      router.refresh()
    } else {
      const body = await response.json().catch(() => null)
      setError({ message: body?.message ?? 'Could not save to your shortlist.', details: body?.details ?? [] })
    }
  }

  async function submitRequest(formData: FormData) {
    setError(null)
    setState('saving')

    const response = await fetch('/api/booking-requests', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': idempotencyKey.current,
      },
      body: JSON.stringify({
        productId,
        startDate: range.startDate,
        endDate: range.endDate,
        budget: formData.get('budget') ? Number(formData.get('budget')) : null,
        objective: formData.get('objective') || null,
        notes: formData.get('notes') || null,
      }),
    })

    if (response.ok) {
      setState('submitted')
      router.refresh()
      return
    }

    const body = await response.json().catch(() => null)
    setError({
      message: body?.message ?? 'Your request could not be sent.',
      details: body?.details ?? ['Check your connection and try again.'],
    })
    setState('idle')
  }

  if (!isSignedInClient) {
    return (
      <div className="rounded-card border border-ink-200 bg-surface p-5">
        <p className="font-medium text-ink-900">Interested in {productName}?</p>
        <p className="mt-1 text-sm text-ink-600">
          Create an account to shortlist media and send a non-binding enquiry. You do not need a
          contract with us to sign up.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={{ pathname: '/register', query: { next: `/products/${productId}`, ...range } }}
            className="rounded-control bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Create an account
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'submitted') {
    return (
      <Notice tone="positive" title="Enquiry sent">
        <p>
          We have your enquiry for {productName}, {formatRange(range.startDate, range.endDate)}.
          Nothing is booked or reserved yet — the team will review it and come back to you.
        </p>
        <p className="mt-2">
          <Link href="/portal" className="font-medium text-brand-700 hover:underline">
            Track it in your account →
          </Link>
        </p>
      </Notice>
    )
  }

  return (
    <div className="rounded-card border border-ink-200 bg-surface p-5">
      <p className="font-medium text-ink-900">Enquire about these dates</p>
      <p className="mt-1 font-mono text-xs tabular text-ink-500">
        {formatRange(range.startDate, range.endDate)}
      </p>

      {!available ? (
        <div className="mt-3">
          <Notice tone="caution" title="Not free for these exact dates">
            You can still send an enquiry. Tell us how flexible you are and we will look for the
            nearest window.
          </Notice>
        </div>
      ) : null}

      <form action={submitRequest} className="mt-4 space-y-3">
        <Field label="What is the campaign for?">
          <input
            name="objective"
            required
            placeholder="Spring membership drive"
            className={inputClass}
          />
        </Field>

        <Field label="Monthly budget" hint="Optional, helps us suggest alternatives">
          <input type="number" name="budget" min={0} step={50} className={inputClass} />
        </Field>

        <Field label="Anything else?" hint="Optional">
          <textarea name="notes" rows={2} className={inputClass} />
        </Field>

        {error ? <ErrorNotice title={error.message} details={error.details} /> : null}

        <button
          type="submit"
          disabled={state === 'saving'}
          className="w-full rounded-control bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {state === 'saving' ? 'Sending…' : 'Send a non-binding enquiry'}
        </button>

        <button
          type="button"
          onClick={addToShortlist}
          disabled={shortlisted}
          className="w-full rounded-control border border-ink-300 px-4 py-2 text-sm font-medium text-ink-800 hover:border-brand-500 hover:text-brand-700 disabled:opacity-60"
        >
          {shortlisted ? 'Saved to your shortlist' : 'Save to shortlist'}
        </button>

        <p className="text-xs text-ink-500">
          Sending an enquiry does not reserve inventory or create a contract.
        </p>
      </form>
    </div>
  )
}
