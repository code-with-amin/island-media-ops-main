import type { PrismaClient, User } from '@prisma/client'
import { now } from '@/domain/clock'
import { newId } from '../ids'
import { validationError } from '../errors'

/**
 * Prototype accounts.
 *
 * Registration is real in the sense that it persists a user and an
 * organisation and the session survives a reload. It is deliberately NOT
 * authentication: there is no password, no verification and no recovery.
 * Production identity is described in the productionisation note; building it
 * here is an explicit exclusion in the brief.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface RegisterInput {
  name: string
  email: string
  organisationName: string
}

export async function registerClient(prisma: PrismaClient, input: RegisterInput) {
  const name = input.name.trim()
  // Stored lower-cased so that a second signup differing only in case is
  // recognised as the same person rather than creating a parallel account.
  const email = input.email.trim().toLowerCase()
  const organisationName = input.organisationName.trim()

  const details: string[] = []
  if (!name) details.push('Enter your name.')
  if (!EMAIL.test(email)) details.push('Enter a valid email address.')
  if (!organisationName) details.push('Enter your organisation name.')
  if (details.length > 0) throw validationError('Check the details you entered.', details)

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    throw validationError('That email address is already registered.', [
      'Use the account switcher to sign in as an existing account.',
    ])
  }

  const at = now()
  const organisationId = newId('org')
  const userId = newId('user')

  return prisma.$transaction(async (tx) => {
    const organisation = await tx.organisation.create({
      data: { id: organisationId, name: organisationName, createdAt: at },
    })

    const user = await tx.user.create({
      data: {
        id: userId,
        name,
        email,
        role: 'client',
        organisationId,
        status: 'active',
      },
    })

    return { user, organisation }
  })
}

/**
 * Resolve a session cookie to a user.
 *
 * Returns null rather than throwing for an unknown id: a cookie left over
 * from an earlier seed should log the visitor out, not break every page.
 */
export async function resolveUser(prisma: PrismaClient, userId: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id: userId } })
}

export interface SwitchableUser {
  id: string
  name: string
  email: string
  role: string
  organisationId: string | null
  organisationName: string | null
}

/** The seeded accounts offered by the prototype role switcher. */
export async function listSwitchableUsers(prisma: PrismaClient): Promise<SwitchableUser[]> {
  const users = await prisma.user.findMany({
    where: { status: 'active' },
    include: { organisation: true },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  })

  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    organisationId: u.organisationId,
    organisationName: u.organisation?.name ?? null,
  }))
}
