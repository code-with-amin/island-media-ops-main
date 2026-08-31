import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import { createTestPrisma, resetTestDb } from '../helpers/testDb'
import { submitBookingRequest } from '@/server/services/bookingRequests'

const prisma = createTestPrisma()

beforeEach(async () => {
  await resetTestDb(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

const payload = {
  organisationId: 'org-silverline',
  advertiserName: 'Silverline Fitness',
  advertiserContactName: 'Avery Stone',
  advertiserEmail: 'avery@example.test',
  productId: 'product-hub-screen',
  requestedAssetId: null,
  startDate: '2027-04-01',
  endDate: '2027-05-01',
  budget: 1500,
  objective: 'Spring membership drive',
  notes: null,
}

describe('submitBookingRequest', () => {
  test('creates a request and records its history', async () => {
    const result = await submitBookingRequest(prisma, {
      input: payload,
      idempotencyKey: 'key-alpha',
      actor: 'client',
    })

    expect(result.created).toBe(true)
    expect(result.request.status).toBe('submitted')

    const history = await prisma.historyEvent.findMany({
      where: { entityType: 'booking_request', entityId: result.request.id },
    })
    expect(history).toHaveLength(1)
    expect(history[0]?.action).toBe('submitted')
    expect(history[0]?.actor).toBe('client')
  })

  test('repeating the same key returns the existing record without creating another', async () => {
    const first = await submitBookingRequest(prisma, {
      input: payload,
      idempotencyKey: 'key-alpha',
      actor: 'client',
    })
    const second = await submitBookingRequest(prisma, {
      input: payload,
      idempotencyKey: 'key-alpha',
      actor: 'client',
    })

    expect(second.created).toBe(false)
    expect(second.request.id).toBe(first.request.id)

    const count = await prisma.bookingRequest.count({ where: { organisationId: 'org-silverline' } })
    // One seeded request plus exactly one created here.
    expect(count).toBe(2)
  })

  test('a repeated key returns the original even when the payload differs', async () => {
    // A retried submission from a flaky connection may carry an edited body.
    // The key is the identity of the attempt, so the first record stands.
    const first = await submitBookingRequest(prisma, {
      input: payload,
      idempotencyKey: 'key-alpha',
      actor: 'client',
    })
    const second = await submitBookingRequest(prisma, {
      input: { ...payload, budget: 99_999, objective: 'Different objective' },
      idempotencyKey: 'key-alpha',
      actor: 'client',
    })

    expect(second.created).toBe(false)
    expect(second.request.id).toBe(first.request.id)
    expect(second.request.budget).toBe(1500)
  })

  test('a new key creates a new request', async () => {
    const first = await submitBookingRequest(prisma, {
      input: payload,
      idempotencyKey: 'key-alpha',
      actor: 'client',
    })
    const second = await submitBookingRequest(prisma, {
      input: payload,
      idempotencyKey: 'key-beta',
      actor: 'client',
    })

    expect(second.created).toBe(true)
    expect(second.request.id).not.toBe(first.request.id)
  })

  test('a key already used by a seeded request returns that request', async () => {
    const result = await submitBookingRequest(prisma, {
      input: payload,
      idempotencyKey: 'seed-request-001',
      actor: 'client',
    })

    expect(result.created).toBe(false)
    expect(result.request.id).toBe('request-001')
  })

  test('rejects a range that ends before it starts', async () => {
    await expect(
      submitBookingRequest(prisma, {
        input: { ...payload, startDate: '2027-05-01', endDate: '2027-04-01' },
        idempotencyKey: 'key-invalid',
        actor: 'client',
      }),
    ).rejects.toThrow(/end after it starts/i)
  })

  test('rejects an unknown product', async () => {
    await expect(
      submitBookingRequest(prisma, {
        input: { ...payload, productId: 'product-does-not-exist' },
        idempotencyKey: 'key-unknown-product',
        actor: 'client',
      }),
    ).rejects.toThrow(/product/i)
  })
})
