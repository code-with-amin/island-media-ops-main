import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import { createTestPrisma, resetTestDb } from '../helpers/testDb'
import { listSwitchableUsers, registerClient, resolveUser } from '@/server/services/auth'
import { getClientSummary } from '@/server/services/clientPortal'

const prisma = createTestPrisma()

beforeEach(async () => {
  await resetTestDb(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

const NEW_CLIENT = {
  name: 'Robin Hale',
  email: 'robin@example.test',
  organisationName: 'Hale Bakery',
}

describe('registerClient', () => {
  test('creates a user and an organisation with no contracts', async () => {
    const result = await registerClient(prisma, NEW_CLIENT)

    expect(result.user.role).toBe('client')
    expect(result.organisation.name).toBe('Hale Bakery')

    const contracts = await prisma.contract.count({
      where: { organisationId: result.organisation.id },
    })
    expect(contracts).toBe(0)
  })

  test('the new account has a usable portal immediately', async () => {
    const { organisation } = await registerClient(prisma, NEW_CLIENT)
    const summary = await getClientSummary(prisma, organisation.id)

    expect(summary.hasContracts).toBe(false)
    expect(summary.organisation.name).toBe('Hale Bakery')
    expect(summary.actionsRequired).toEqual([])
  })

  test('the new user resolves to their own organisation', async () => {
    const { user, organisation } = await registerClient(prisma, NEW_CLIENT)
    const resolved = await resolveUser(prisma, user.id)

    expect(resolved?.organisationId).toBe(organisation.id)
    expect(resolved?.role).toBe('client')
  })

  test('rejects an email already in use', async () => {
    await registerClient(prisma, NEW_CLIENT)
    await expect(registerClient(prisma, NEW_CLIENT)).rejects.toThrow(/already/i)
  })

  test('rejects an email already used by a seeded account', async () => {
    await expect(
      registerClient(prisma, { ...NEW_CLIENT, email: 'avery@example.test' }),
    ).rejects.toThrow(/already/i)
  })

  test('rejects a malformed email', async () => {
    await expect(
      registerClient(prisma, { ...NEW_CLIENT, email: 'not-an-email' }),
    ).rejects.toThrow(/email/i)
  })

  test('rejects a blank organisation name', async () => {
    await expect(
      registerClient(prisma, { ...NEW_CLIENT, organisationName: '   ' }),
    ).rejects.toThrow(/organisation/i)
  })

  test('normalises the email so case does not create a second account', async () => {
    await registerClient(prisma, NEW_CLIENT)
    await expect(
      registerClient(prisma, { ...NEW_CLIENT, email: 'ROBIN@example.test' }),
    ).rejects.toThrow(/already/i)
  })
})

describe('listSwitchableUsers', () => {
  test('offers one seeded account per role for the prototype switcher', async () => {
    const users = await listSwitchableUsers(prisma)
    const roles = users.map((u) => u.role)

    expect(roles).toContain('manager')
    expect(roles).toContain('fitter')
    expect(roles).toContain('client')
  })

  test('labels client accounts with their organisation', async () => {
    const users = await listSwitchableUsers(prisma)
    const avery = users.find((u) => u.id === 'user-client-silverline')
    expect(avery?.organisationName).toBe('Silverline Fitness')
  })

  test('staff accounts have no organisation', async () => {
    const users = await listSwitchableUsers(prisma)
    const manager = users.find((u) => u.id === 'user-manager-01')
    expect(manager?.organisationName).toBeNull()
  })
})

describe('resolveUser', () => {
  test('returns null for an unknown id rather than throwing', async () => {
    // A stale cookie from an earlier seed must log the visitor out, not crash.
    expect(await resolveUser(prisma, 'user-does-not-exist')).toBeNull()
  })
})
