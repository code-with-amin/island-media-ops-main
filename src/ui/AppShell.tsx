import Link from 'next/link'
import type { Route } from 'next'
import { prisma } from '@/server/db'
import { getSession } from '@/server/session'
import { listSwitchableUsers } from '@/server/services/auth'
import { RoleSwitcher } from './RoleSwitcher'
import { FIXTURE_CLOCK_ISO } from '@/domain/clock'
import { formatDateTime } from './format'

/**
 * The frame every interface sits in.
 *
 * Management, field and portal each pass their own navigation, but the
 * wordmark, the account switcher and the prototype clock are identical
 * everywhere. Those three constants are what make the surfaces read as one
 * product rather than three applications.
 */
export interface NavItem {
  href: Route
  label: string
}

export async function AppShell({
  surface,
  nav = [],
  children,
  width = 'wide',
}: {
  surface: string
  nav?: NavItem[]
  children: React.ReactNode
  width?: 'wide' | 'narrow'
}) {
  const [session, available] = await Promise.all([getSession(), listSwitchableUsers(prisma)])

  return (
    <div className="min-h-screen">
      <header className="border-b border-ink-200 bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-sm font-semibold tracking-tight text-ink-900">
              Island Media Co
            </span>
            <span className="eyebrow">{surface}</span>
          </Link>

          <nav className="flex items-center gap-4 text-sm">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="text-ink-600 hover:text-brand-600">
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {session ? (
              <span className="hidden text-xs text-ink-500 sm:inline">
                {session.name} · {session.role}
              </span>
            ) : null}
            <RoleSwitcher session={session} available={available} />
          </div>
        </div>
      </header>

      <main className={width === 'narrow' ? 'mx-auto max-w-3xl px-5 py-8' : 'mx-auto max-w-7xl px-5 py-8'}>
        {children}
      </main>

      <footer className="mx-auto max-w-7xl px-5 pb-10">
        <p className="border-t border-ink-200 pt-4 text-xs text-ink-400">
          Prototype with fictional data. Clock fixed at{' '}
          <span className="font-mono tabular">{formatDateTime(FIXTURE_CLOCK_ISO)} UTC</span>.
        </p>
      </footer>
    </div>
  )
}
