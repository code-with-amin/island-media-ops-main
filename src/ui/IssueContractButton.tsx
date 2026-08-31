'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ErrorNotice } from './primitives'

/** Issue a draft to the client. The point the contract becomes visible. */
export function IssueContractButton({ contractId }: { contractId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null)

  async function issue() {
    setError(null)
    setPending(true)

    const response = await fetch(`/api/management/contracts/${contractId}/issue`, {
      method: 'POST',
    })
    setPending(false)

    if (response.ok) {
      router.refresh()
      return
    }

    const body = await response.json().catch(() => null)
    setError({
      message: body?.message ?? 'The contract could not be issued.',
      details: body?.details ?? [],
    })
  }

  return (
    <div>
      <button
        type="button"
        onClick={issue}
        disabled={pending}
        className="rounded-control bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? 'Issuing…' : 'Issue to client'}
      </button>
      {error ? <div className="mt-2"><ErrorNotice title={error.message} details={error.details} /></div> : null}
    </div>
  )
}
