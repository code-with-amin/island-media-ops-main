import Link from 'next/link'
import { prisma } from '@/server/db'
import { getSession } from '@/server/session'
import { listSwitchableUsers } from '@/server/services/auth'
import { RoleSwitcher } from './RoleSwitcher'
import { ConnectionBanner } from './ConnectionBanner'

/**
 * The field app shell.
 *
 * Deliberately not the desktop chrome. A fitter is standing at a depot gate
 * holding a phone in one hand, so this is a single column, a short sticky
 * header, and nothing else competing for the screen. It uses the same tokens
 * and the same primitives as the other two surfaces — the difference is
 * density and touch target size, not a second design.
 */
export async function FieldShell({ children }: { children: React.ReactNode }) {
  const [session, available] = await Promise.all([getSession(), listSwitchableUsers(prisma)])

  return (
    <div className="mx-auto min-h-screen max-w-md bg-canvas">
      <header className="sticky top-0 z-10 border-b border-ink-200 bg-surface">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/field" className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-ink-900">
              Island Media Co
            </p>
            <p className="eyebrow">Field</p>
          </Link>
          <div className="ml-auto">
            <RoleSwitcher session={session} available={available} />
          </div>
        </div>
        <ConnectionBanner />
      </header>

      <main className="px-4 py-5 pb-24">{children}</main>
    </div>
  )
}
