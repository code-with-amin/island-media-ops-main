'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Card, ErrorNotice, Field, inputClass } from './primitives'

/**
 * Fictional registration.
 *
 * Persists a user and an organisation and signs the visitor in, so the session
 * and the account survive a reload. It is deliberately not authentication:
 * there is no password, and the productionisation note covers real identity,
 * verification and recovery.
 */
export function RegisterForm({ next }: { next?: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<{ message: string; details: string[] } | null>(null)

  async function register(formData: FormData) {
    setError(null)
    setPending(true)

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: formData.get('name'),
        email: formData.get('email'),
        organisationName: formData.get('organisationName'),
      }),
    })

    if (response.ok) {
      // A full navigation, so the new session cookie is read on the server.
      window.location.href = next && next.startsWith('/') ? next : '/portal'
      return
    }

    const body = await response.json().catch(() => null)
    setError({
      message: body?.message ?? 'We could not create your account.',
      details: body?.details ?? ['Check your connection and try again.'],
    })
    setPending(false)
  }

  return (
    <Card className="p-6">
      <form action={register} className="space-y-4">
        <Field label="Your name">
          <input name="name" required autoComplete="name" className={inputClass} />
        </Field>

        <Field label="Email address" hint="Used to identify your account in this prototype">
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            className={inputClass}
          />
        </Field>

        <Field label="Organisation" hint="The business the advertising is for">
          <input
            name="organisationName"
            required
            autoComplete="organization"
            className={inputClass}
          />
        </Field>

        {error ? <ErrorNotice title={error.message} details={error.details} /> : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-control bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? 'Creating your account…' : 'Create account'}
        </button>

        <p className="text-xs text-ink-500">
          Prototype only. No password is set and no email is sent.
        </p>
      </form>
    </Card>
  )
}
