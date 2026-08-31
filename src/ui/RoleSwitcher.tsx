'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { SwitchableUser } from '@/server/services/auth'
import type { Session } from '@/server/session'

/**
 * Prototype account switcher.
 *
 * Stands in for authentication, which the brief excludes. It is deliberately
 * conspicuous rather than tucked away: a reviewer needs to move between the
 * manager, the fitter and two different client organisations quickly, and
 * should never be in doubt about who they currently are.
 */
export function RoleSwitcher({
  session,
  available,
}: {
  session: Session | null
  available: SwitchableUser[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  async function switchTo(userId: string) {
    setFailed(false)
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: userId || null }),
    })

    if (!response.ok) {
      setFailed(true)
      return
    }

    // The destination differs by role, so land people where their work is.
    const user = available.find((u) => u.id === userId)
    const destination =
      user?.role === 'manager' ? '/manage' : user?.role === 'fitter' ? '/field' : '/portal'

    startTransition(() => {
      router.push(userId ? destination : '/')
      router.refresh()
    })
  }

  const grouped = {
    manager: available.filter((u) => u.role === 'manager'),
    fitter: available.filter((u) => u.role === 'fitter'),
    client: available.filter((u) => u.role === 'client'),
  }

  return (
    <div className="flex items-center gap-2">
      {failed ? (
        <span className="text-xs text-critical" role="alert">
          Could not switch account
        </span>
      ) : null}

      <label className="sr-only" htmlFor="role-switcher">
        Switch prototype account
      </label>
      <select
        id="role-switcher"
        value={session?.userId ?? ''}
        disabled={pending}
        onChange={(e) => switchTo(e.target.value)}
        className="max-w-[15rem] rounded-control border border-ink-300 bg-surface px-2.5 py-1.5 text-xs text-ink-800 disabled:opacity-60"
      >
        <option value="">Signed out — browse as a visitor</option>
        <optgroup label="Agency">
          {grouped.manager.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · manager
            </option>
          ))}
          {grouped.fitter.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · fitter
            </option>
          ))}
        </optgroup>
        <optgroup label="Clients">
          {grouped.client.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} · {u.organisationName}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  )
}
