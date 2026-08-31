import { cookies } from 'next/headers'
import { prisma } from './db'
import { resolveUser } from './services/auth'
import { ApiError } from './errors'

/**
 * Prototype session.
 *
 * A cookie holding a user id, and nothing else. This is a role switcher, not
 * authentication: it is unsigned, there is no password and anyone can become
 * anyone. That is an explicit exclusion in the brief, and the production
 * replacement is described in the productionisation note.
 *
 * What it does have to do properly is persist across a reload, which is why
 * it is a cookie rather than component state.
 */
export const SESSION_COOKIE = 'ims_user'

export interface Session {
  userId: string
  name: string
  role: 'manager' | 'fitter' | 'client'
  organisationId: string | null
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies()
  const userId = store.get(SESSION_COOKIE)?.value
  if (!userId) return null

  const user = await resolveUser(prisma, userId)
  // A cookie left over from an earlier seed resolves to nobody. Treat that as
  // signed out rather than as an error on every page.
  if (!user || user.status !== 'active') return null

  return {
    userId: user.id,
    name: user.name,
    role: user.role as Session['role'],
    organisationId: user.organisationId,
  }
}

export async function setSessionUser(userId: string): Promise<void> {
  const store = await cookies()
  store.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

export async function clearSession(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) throw new ApiError('forbidden', 'Sign in to continue.')
  return session
}

export async function requireRole(role: Session['role']): Promise<Session> {
  const session = await requireSession()
  if (session.role !== role) {
    throw new ApiError('forbidden', `This area is for ${role} accounts.`)
  }
  return session
}

/** A client session that is guaranteed to have an organisation to scope to. */
export async function requireClient(): Promise<Session & { organisationId: string }> {
  const session = await requireRole('client')
  if (!session.organisationId) {
    throw new ApiError('forbidden', 'This account has no client organisation.')
  }
  return session as Session & { organisationId: string }
}
