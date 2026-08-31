import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import { createTestPrisma, resetTestDb } from '../helpers/testDb'
import {
  actOnContract,
  getClientContract,
  getClientSummary,
  listClientContracts,
  respondToInformationRequest,
} from '@/server/services/clientPortal'
import { decideBookingRequest } from '@/server/services/management'

const prisma = createTestPrisma()

beforeEach(async () => {
  await resetTestDb(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

const LIGHTHOUSE = 'org-lighthouse'
const OAK = 'org-oak-legal'
const SILVERLINE = 'org-silverline'

// ------------------------------------------------------ tenant isolation (9)

describe('organisation scoping', () => {
  test('an organisation cannot retrieve another organisation contract', async () => {
    // contract-001 belongs to Lighthouse Learning.
    await expect(getClientContract(prisma, OAK, 'contract-001')).rejects.toThrow(/not be found/i)
  })

  test('the owning organisation can retrieve its own contract', async () => {
    const contract = await getClientContract(prisma, LIGHTHOUSE, 'contract-001')
    expect(contract.id).toBe('contract-001')
    expect(contract.status).toBe('issued')
  })

  test('a contract list contains only that organisation contracts', async () => {
    const lighthouse = await listClientContracts(prisma, LIGHTHOUSE)
    const oak = await listClientContracts(prisma, OAK)

    expect(lighthouse.map((c) => c.id)).toEqual(['contract-001'])
    expect(oak.map((c) => c.id)).toEqual(['contract-002'])
  })

  test('another organisation cannot act on a contract it does not own', async () => {
    await expect(
      actOnContract(prisma, OAK, 'contract-001', { action: 'accept' }),
    ).rejects.toThrow(/not be found/i)
  })

  test('a service timeline contains only that organisation events', async () => {
    const oak = await getClientContract(prisma, OAK, 'contract-002')
    for (const event of oak.timeline) {
      expect(event.organisationId).toBe(OAK)
    }
    expect(oak.timeline.length).toBeGreaterThan(0)
  })
})

// ------------------------------------------------- no-contract client (5)

describe('a client with no contracts', () => {
  test('has a usable portal summary rather than an error', async () => {
    const summary = await getClientSummary(prisma, SILVERLINE)

    expect(summary.organisation.name).toBe('Silverline Fitness')
    expect(summary.contracts).toEqual([])
    expect(summary.hasContracts).toBe(false)
  })

  test('still sees its own submitted booking request', async () => {
    const summary = await getClientSummary(prisma, SILVERLINE)
    expect(summary.bookingRequests.map((r) => r.id)).toContain('request-001')
  })

  test('has nothing requiring attention while the enquiry sits with the team', async () => {
    const summary = await getClientSummary(prisma, SILVERLINE)
    expect(summary.actionsRequired).toEqual([])
  })
})

describe('a client with an issued contract', () => {
  test('is told the contract needs a decision', async () => {
    const summary = await getClientSummary(prisma, LIGHTHOUSE)
    expect(summary.hasContracts).toBe(true)
    expect(summary.actionsRequired.map((a) => a.id)).toContain('contract-001')
  })
})

// ------------------------------------------------ answering the agency (B3)

describe('when the agency asks the client for more information', () => {
  const ask = (note = 'Could you confirm your preferred start date?') =>
    decideBookingRequest(prisma, 'request-001', { decision: 'request_information', note })

  test('the question reaches the client, not just a status badge', async () => {
    await ask()
    const summary = await getClientSummary(prisma, SILVERLINE)

    const request = summary.bookingRequests.find((r) => r.id === 'request-001')
    expect(request?.awaitingYou).toBe(true)
    expect(request?.question).toBe('Could you confirm your preferred start date?')
  })

  test('it appears as something requiring the client attention', async () => {
    await ask()
    const summary = await getClientSummary(prisma, SILVERLINE)

    expect(summary.actionsRequired.map((a) => a.id)).toContain('request-001')
    expect(summary.actionsRequired.find((a) => a.id === 'request-001')?.kind).toBe(
      'booking_request',
    )
  })

  test('the client can answer, and the enquiry returns to the team', async () => {
    await ask()
    const updated = await respondToInformationRequest(
      prisma,
      SILVERLINE,
      'request-001',
      'Artwork will be ready by 22 January.',
    )

    // Back in the decision queue: the ball is with the agency again.
    expect(updated.status).toBe('submitted')

    const history = await prisma.historyEvent.findMany({
      where: { entityType: 'booking_request', entityId: 'request-001' },
      orderBy: { at: 'asc' },
    })
    expect(history.at(-1)?.action).toBe('information_supplied')
    expect(history.at(-1)?.actor).toBe('client')
    expect(history.at(-1)?.note).toBe('Artwork will be ready by 22 January.')
  })

  test('answering clears the outstanding action', async () => {
    await ask()
    await respondToInformationRequest(prisma, SILVERLINE, 'request-001', 'Ready by 22 January.')

    const summary = await getClientSummary(prisma, SILVERLINE)
    expect(summary.actionsRequired).toEqual([])
    expect(summary.bookingRequests.find((r) => r.id === 'request-001')?.awaitingYou).toBe(false)
  })

  test('an empty answer is refused', async () => {
    await ask()
    await expect(
      respondToInformationRequest(prisma, SILVERLINE, 'request-001', '   '),
    ).rejects.toThrow(/answer/i)
  })

  test('a client cannot answer an enquiry that was not queried', async () => {
    await expect(
      respondToInformationRequest(prisma, SILVERLINE, 'request-001', 'Anything.'),
    ).rejects.toThrow(/not waiting/i)
  })

  test('a client cannot answer another organisation enquiry', async () => {
    await ask()
    await expect(
      respondToInformationRequest(prisma, OAK, 'request-001', 'Anything.'),
    ).rejects.toThrow(/not be found/i)
  })
})

// ------------------------------------------------------- contract actions (6)

describe('actOnContract', () => {
  test('accepting an issued contract activates the campaign and creates a booking', async () => {
    const result = await actOnContract(prisma, LIGHTHOUSE, 'contract-001', { action: 'accept' })

    expect(result.status).toBe('accepted')

    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: 'campaign-001' } })
    expect(campaign.status).toBe('active')
    expect(campaign.bookingId).not.toBeNull()

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: campaign.bookingId as string },
    })
    expect(booking.status).toBe('confirmed')
    expect(booking.assetId).toBe('asset-door-b')
  })

  test('acceptance records history and a client-visible service event', async () => {
    await actOnContract(prisma, LIGHTHOUSE, 'contract-001', { action: 'accept' })

    const history = await prisma.historyEvent.findMany({
      where: { entityType: 'contract', entityId: 'contract-001' },
      orderBy: { at: 'asc' },
    })
    expect(history.at(-1)?.action).toBe('accepted')
    expect(history.at(-1)?.actor).toBe('client')

    const events = await prisma.serviceEvent.findMany({
      where: { contractId: 'contract-001', type: 'contract_accepted' },
    })
    expect(events).toHaveLength(1)
    expect(events[0]?.clientVisible).toBe(true)
  })

  test('acceptance is refused when the asset was taken in the meantime', async () => {
    // Someone else confirms the same door for an overlapping window.
    await prisma.booking.create({
      data: {
        id: 'booking-conflict',
        productId: 'product-hub-door',
        assetId: 'asset-door-b',
        startDate: '2027-03-01',
        endDate: '2027-04-01',
        status: 'confirmed',
      },
    })

    await expect(
      actOnContract(prisma, LIGHTHOUSE, 'contract-001', { action: 'accept' }),
    ).rejects.toThrow(/no longer available/i)

    // The contract must be left exactly as it was.
    const contract = await prisma.contract.findUniqueOrThrow({ where: { id: 'contract-001' } })
    expect(contract.status).toBe('issued')
    expect(contract.acceptedAt).toBeNull()
  })

  test('requesting a change does not rewrite the issued contract', async () => {
    const before = await prisma.contract.findUniqueOrThrow({ where: { id: 'contract-001' } })

    const result = await actOnContract(prisma, LIGHTHOUSE, 'contract-001', {
      action: 'request_change',
      note: 'Please move the start date to 15 February.',
    })

    expect(result.status).toBe('change_requested')
    expect(result.version).toBe(before.version)
    expect(result.total).toBe(before.total)
    expect(result.startDate).toBe(before.startDate)
  })

  test('requesting a change creates a pending client request for management', async () => {
    await actOnContract(prisma, LIGHTHOUSE, 'contract-001', {
      action: 'request_change',
      note: 'Please move the start date to 15 February.',
    })

    const requests = await prisma.clientRequest.findMany({
      where: { contractId: 'contract-001', type: 'contract_change' },
    })
    expect(requests).toHaveLength(1)
    // Pending until management changes the underlying state.
    expect(requests[0]?.status).toBe('submitted')
  })

  test('a change request requires a note', async () => {
    await expect(
      actOnContract(prisma, LIGHTHOUSE, 'contract-001', { action: 'request_change' }),
    ).rejects.toThrow(/describe/i)
  })

  test('an already active contract cannot be accepted again', async () => {
    await expect(actOnContract(prisma, OAK, 'contract-002', { action: 'accept' })).rejects.toThrow(
      /cannot accept/i,
    )
  })
})
