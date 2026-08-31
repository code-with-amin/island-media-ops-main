import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import { createTestPrisma, resetTestDb } from '../helpers/testDb'
import {
  createContractFromRequest,
  decideBookingRequest,
  getBookingRequestDetail,
  getDashboard,
  issueContract,
  respondToChangeRequest,
} from '@/server/services/management'
import { actOnContract } from '@/server/services/clientPortal'
import { submitBookingRequest } from '@/server/services/bookingRequests'

const prisma = createTestPrisma()

beforeEach(async () => {
  await resetTestDb(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

/** A request that can actually be approved: bus rear panels are clear in autumn. */
async function approvableRequest() {
  const { request } = await submitBookingRequest(prisma, {
    input: {
      organisationId: 'org-silverline',
      advertiserName: 'Silverline Fitness',
      advertiserContactName: 'Avery Stone',
      advertiserEmail: 'avery@example.test',
      productId: 'product-bus-rear',
      requestedAssetId: null,
      startDate: '2027-09-01',
      endDate: '2027-10-01',
      budget: 1200,
      objective: 'Autumn membership drive',
      notes: null,
    },
    idempotencyKey: 'key-approvable',
    actor: 'client',
  })
  return request
}

describe('getDashboard', () => {
  test('leads with the requests awaiting a decision', async () => {
    const dashboard = await getDashboard(prisma)
    expect(dashboard.awaitingDecision.map((r) => r.id)).toContain('request-001')
  })

  test('surfaces contracts issued but not yet answered by the client', async () => {
    const dashboard = await getDashboard(prisma)
    expect(dashboard.awaitingClient.map((c) => c.id)).toContain('contract-001')
  })

  test('surfaces client requests still pending review', async () => {
    const dashboard = await getDashboard(prisma)
    expect(dashboard.clientRequests.map((r) => r.id)).toContain('client-request-001')
  })

  test('surfaces scheduled field work', async () => {
    const dashboard = await getDashboard(prisma)
    expect(dashboard.upcomingWork.map((w) => w.id)).toContain('work-order-001')
  })
})

describe('getBookingRequestDetail', () => {
  test('shows why the seeded request cannot be fulfilled', async () => {
    const detail = await getBookingRequestDetail(prisma, 'request-001')

    expect(detail.availability.available).toBe(false)
    // Six days against a thirty-day minimum term, reported separately from
    // the inventory problem so the manager sees both.
    expect(detail.meetsMinimumTerm).toBe(false)
  })

  test('names the blocking record for each unavailable asset', async () => {
    const detail = await getBookingRequestDetail(prisma, 'request-001')
    if (detail.availability.allocationModel === 'exclusive_asset') {
      const reasons = detail.availability.candidates.map((c) => c.blockedBy)
      expect(reasons).toContain('booking')
      expect(reasons).toContain('outage')
    }
  })

  test('warns when a candidate asset has stale verification', async () => {
    const detail = await getBookingRequestDetail(prisma, 'request-002')
    // Hub door B was last verified in October 2026 by spreadsheet import.
    expect(detail.staleVerificationWarnings.map((w) => w.assetId)).toContain('asset-door-b')
  })

  test('throws for an unknown request', async () => {
    await expect(getBookingRequestDetail(prisma, 'request-nope')).rejects.toThrow(/not be found/i)
  })
})

describe('decideBookingRequest', () => {
  test('refuses to approve when no asset is available', async () => {
    await expect(
      decideBookingRequest(prisma, 'request-001', { decision: 'approve' }),
    ).rejects.toThrow(/not available/i)

    const request = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: 'request-001' } })
    expect(request.status).toBe('submitted')
  })

  test('records a request for more information with its note', async () => {
    const updated = await decideBookingRequest(prisma, 'request-001', {
      decision: 'request_information',
      note: 'Please confirm your preferred start date.',
    })

    expect(updated.status).toBe('information_required')

    const history = await prisma.historyEvent.findMany({
      where: { entityType: 'booking_request', entityId: 'request-001' },
      orderBy: { at: 'asc' },
    })
    expect(history.at(-1)?.action).toBe('information_required')
    expect(history.at(-1)?.note).toBe('Please confirm your preferred start date.')
  })

  test('requires a note when asking for more information', async () => {
    await expect(
      decideBookingRequest(prisma, 'request-001', { decision: 'request_information' }),
    ).rejects.toThrow(/note/i)
  })

  test('declines a request with a reason', async () => {
    const updated = await decideBookingRequest(prisma, 'request-001', {
      decision: 'decline',
      note: 'Below the minimum term for this product.',
    })
    expect(updated.status).toBe('declined')
  })

  test('approves a request when inventory is free', async () => {
    const request = await approvableRequest()
    const updated = await decideBookingRequest(prisma, request.id, {
      decision: 'approve',
      assetId: 'asset-bus-101-rear',
    })
    expect(updated.status).toBe('approved')
  })

  test('refuses to approve against an asset that is not free', async () => {
    const request = await approvableRequest()
    await prisma.booking.create({
      data: {
        id: 'booking-autumn',
        productId: 'product-bus-rear',
        assetId: 'asset-bus-101-rear',
        startDate: '2027-09-15',
        endDate: '2027-09-20',
        status: 'confirmed',
      },
    })

    await expect(
      decideBookingRequest(prisma, request.id, {
        decision: 'approve',
        assetId: 'asset-bus-101-rear',
      }),
    ).rejects.toThrow(/not available/i)
  })

  test('an already decided request cannot be decided again', async () => {
    await expect(
      decideBookingRequest(prisma, 'request-002', { decision: 'approve' }),
    ).rejects.toThrow(/already/i)
  })
})

describe('createContractFromRequest and issueContract', () => {
  test('creates a draft contract carrying the request dates and asset', async () => {
    const request = await approvableRequest()
    await decideBookingRequest(prisma, request.id, {
      decision: 'approve',
      assetId: 'asset-bus-101-rear',
    })

    const contract = await createContractFromRequest(prisma, request.id, {
      assetId: 'asset-bus-101-rear',
    })

    expect(contract.status).toBe('draft')
    expect(contract.version).toBe(1)
    expect(contract.startDate).toBe('2027-09-01')
    expect(contract.total).toBeGreaterThan(0)
  })

  test('a draft contract is not visible to the client as an action', async () => {
    const request = await approvableRequest()
    await decideBookingRequest(prisma, request.id, {
      decision: 'approve',
      assetId: 'asset-bus-101-rear',
    })
    const contract = await createContractFromRequest(prisma, request.id, {
      assetId: 'asset-bus-101-rear',
    })

    const events = await prisma.serviceEvent.findMany({ where: { contractId: contract.id } })
    expect(events).toHaveLength(0)
  })

  test('issuing a contract makes it visible and tells the client', async () => {
    const request = await approvableRequest()
    await decideBookingRequest(prisma, request.id, {
      decision: 'approve',
      assetId: 'asset-bus-101-rear',
    })
    const draft = await createContractFromRequest(prisma, request.id, {
      assetId: 'asset-bus-101-rear',
    })

    const issued = await issueContract(prisma, draft.id)

    expect(issued.status).toBe('issued')
    expect(issued.issuedAt).not.toBeNull()

    const events = await prisma.serviceEvent.findMany({ where: { contractId: draft.id } })
    expect(events[0]?.type).toBe('contract_issued')
    expect(events[0]?.clientVisible).toBe(true)
  })

  test('issuing creates the connected campaign awaiting acceptance', async () => {
    const request = await approvableRequest()
    await decideBookingRequest(prisma, request.id, {
      decision: 'approve',
      assetId: 'asset-bus-101-rear',
    })
    const draft = await createContractFromRequest(prisma, request.id, {
      assetId: 'asset-bus-101-rear',
    })
    await issueContract(prisma, draft.id)

    const campaign = await prisma.campaign.findFirstOrThrow({ where: { contractId: draft.id } })
    expect(campaign.status).toBe('awaiting_contract_acceptance')
    expect(campaign.bookingId).toBeNull()
  })

  test('a request cannot be turned into a second contract', async () => {
    // An idempotency key only survives one mounted form. A manager who
    // revisits an approved request days later presents a genuinely new key,
    // so the invariant has to live in the data, not in the key.
    const request = await approvableRequest()
    await decideBookingRequest(prisma, request.id, {
      decision: 'approve',
      assetId: 'asset-bus-101-rear',
    })
    await createContractFromRequest(prisma, request.id, { assetId: 'asset-bus-101-rear' })

    await expect(
      createContractFromRequest(prisma, request.id, { assetId: 'asset-bus-101-rear' }),
    ).rejects.toThrow(/already has a contract/i)

    const contracts = await prisma.contract.count({ where: { bookingRequestId: request.id } })
    expect(contracts).toBe(1)
  })

  test('a cancelled contract frees the request to be drafted again', async () => {
    const request = await approvableRequest()
    await decideBookingRequest(prisma, request.id, {
      decision: 'approve',
      assetId: 'asset-bus-101-rear',
    })
    const first = await createContractFromRequest(prisma, request.id, {
      assetId: 'asset-bus-101-rear',
    })
    await prisma.contract.update({ where: { id: first.id }, data: { status: 'cancelled' } })

    const second = await createContractFromRequest(prisma, request.id, {
      assetId: 'asset-bus-101-rear',
    })
    expect(second.id).not.toBe(first.id)
  })

  test('request detail names the contract already created from it', async () => {
    const request = await approvableRequest()
    await decideBookingRequest(prisma, request.id, {
      decision: 'approve',
      assetId: 'asset-bus-101-rear',
    })
    const contract = await createContractFromRequest(prisma, request.id, {
      assetId: 'asset-bus-101-rear',
    })

    const detail = await getBookingRequestDetail(prisma, request.id)
    expect(detail.existingContract?.id).toBe(contract.id)
    expect(detail.existingContract?.status).toBe('draft')
  })

  test('request detail has no contract before one is drafted', async () => {
    const detail = await getBookingRequestDetail(prisma, 'request-001')
    expect(detail.existingContract).toBeNull()
  })

  test('an already issued contract cannot be issued again', async () => {
    await expect(issueContract(prisma, 'contract-002')).rejects.toThrow(/cannot issue/i)
  })
})

// ------------------------------------------------- internal detail views

describe('management detail views', () => {
  test('a manager sees any organisation contract, unlike a client', async () => {
    const { getContractDetail } = await import('@/server/services/management')

    const lighthouse = await getContractDetail(prisma, 'contract-001')
    const oak = await getContractDetail(prisma, 'contract-002')

    expect(lighthouse.organisation.name).toBe('Lighthouse Learning')
    expect(oak.organisation.name).toBe('Oak Legal')
  })

  test('contract detail carries the full internal history, not the client summary', async () => {
    const { getContractDetail } = await import('@/server/services/management')
    const contract = await getContractDetail(prisma, 'contract-002')

    expect(contract.history.map((h) => h.action)).toEqual(['issued', 'accepted', 'activated'])
    expect(contract.workOrders.map((w) => w.id)).toContain('work-order-001')
  })

  test('client detail gathers everything about one organisation', async () => {
    const { getClientDetail } = await import('@/server/services/management')
    const client = await getClientDetail(prisma, 'org-oak-legal')

    expect(client.organisation.name).toBe('Oak Legal')
    expect(client.contracts.map((c) => c.id)).toEqual(['contract-002'])
    expect(client.users.map((u) => u.email)).toContain('taylor@example.test')
    expect(client.clientRequests.map((r) => r.id)).toContain('client-request-001')
  })

  test('a client with no contracts still has a detail page', async () => {
    const { getClientDetail } = await import('@/server/services/management')
    const client = await getClientDetail(prisma, 'org-silverline')

    expect(client.contracts).toEqual([])
    expect(client.bookingRequests.map((r) => r.id)).toContain('request-001')
  })

  test('inventory view reports each asset with its verification age', async () => {
    const { getInventory } = await import('@/server/services/management')
    const inventory = await getInventory(prisma, {
      startDate: '2027-02-12',
      endDate: '2027-02-18',
    })

    const busRear = inventory.find((p) => p.id === 'product-bus-rear')
    expect(busRear?.availability.available).toBe(false)

    // Hub door B was last verified in October 2026 by spreadsheet import.
    const door = inventory.find((p) => p.id === 'product-hub-door')
    expect(door?.staleVerificationWarnings.map((w) => w.assetId)).toEqual(['asset-door-b'])

    // Bus 201 was verified three days before the clock, and Bus 202 is retired
    // so its verification age cannot matter: neither is a warning.
    const wrap = inventory.find((p) => p.id === 'product-bus-wrap')
    expect(wrap?.staleVerificationWarnings).toEqual([])
  })
})

// ------------------------------------------------ answering a change request

describe('respondToChangeRequest', () => {
  /** Put contract-001 into change_requested, the way a client would. */
  async function clientAsksForAChange(note = 'Please move the end date back.') {
    await actOnContract(prisma, 'org-lighthouse', 'contract-001', {
      action: 'request_change',
      note,
    })
  }

  test('revising re-issues a new version with the new terms', async () => {
    await clientAsksForAChange()

    const revised = await respondToChangeRequest(prisma, 'contract-001', {
      action: 'revise',
      endDate: '2027-04-01',
      note: 'End date brought back a month as requested.',
    })

    expect(revised.status).toBe('issued')
    // A new offer, so a new version. The client accepts version 2, not 1.
    expect(revised.version).toBe(2)
    expect(revised.endDate).toBe('2027-04-01')
  })

  test('revising recalculates the total from the new period', async () => {
    await clientAsksForAChange()
    const before = await prisma.contract.findUniqueOrThrow({ where: { id: 'contract-001' } })

    const revised = await respondToChangeRequest(prisma, 'contract-001', {
      action: 'revise',
      endDate: '2027-04-01',
      note: 'Shorter period.',
    })

    expect(revised.total).toBeLessThan(before.total)

    const items = await prisma.contractItem.findMany({ where: { contractId: 'contract-001' } })
    expect(items[0]?.lineTotal).toBe(revised.total)
  })

  test('revising closes the client request rather than leaving it pending', async () => {
    await clientAsksForAChange()
    await respondToChangeRequest(prisma, 'contract-001', {
      action: 'revise',
      endDate: '2027-04-01',
      note: 'Done.',
    })

    const requests = await prisma.clientRequest.findMany({ where: { contractId: 'contract-001' } })
    expect(requests[0]?.status).toBe('accepted')
  })

  test('revising tells the client there is a new version to review', async () => {
    await clientAsksForAChange()
    await respondToChangeRequest(prisma, 'contract-001', {
      action: 'revise',
      endDate: '2027-04-01',
      note: 'Done.',
    })

    const events = await prisma.serviceEvent.findMany({
      where: { contractId: 'contract-001', type: 'contract_reissued' },
    })
    expect(events).toHaveLength(1)
    expect(events[0]?.clientVisible).toBe(true)
  })

  test('new dates are rechecked against inventory and a conflict is refused', async () => {
    await clientAsksForAChange()

    // Someone takes Hub door B for the period the client asked to move into.
    await prisma.booking.create({
      data: {
        id: 'booking-clash',
        productId: 'product-hub-door',
        assetId: 'asset-door-b',
        startDate: '2027-05-01',
        endDate: '2027-08-01',
        status: 'confirmed',
      },
    })

    await expect(
      respondToChangeRequest(prisma, 'contract-001', {
        action: 'revise',
        endDate: '2027-07-01',
        note: 'Extending.',
      }),
    ).rejects.toThrow(/no longer available|not available/i)

    // Nothing may be half-applied.
    const contract = await prisma.contract.findUniqueOrThrow({ where: { id: 'contract-001' } })
    expect(contract.status).toBe('change_requested')
    expect(contract.version).toBe(1)
    expect(contract.endDate).toBe('2027-05-01')
  })

  test('declining keeps the terms and puts the contract back to the client', async () => {
    await clientAsksForAChange()
    const before = await prisma.contract.findUniqueOrThrow({ where: { id: 'contract-001' } })

    const result = await respondToChangeRequest(prisma, 'contract-001', {
      action: 'decline',
      note: 'The panel is committed elsewhere from May.',
    })

    expect(result.status).toBe('issued')
    // Declining is not a new offer, so the version stands.
    expect(result.version).toBe(before.version)
    expect(result.endDate).toBe(before.endDate)
    expect(result.total).toBe(before.total)

    const requests = await prisma.clientRequest.findMany({ where: { contractId: 'contract-001' } })
    expect(requests[0]?.status).toBe('declined')
  })

  test('a reason is required either way', async () => {
    await clientAsksForAChange()
    await expect(
      respondToChangeRequest(prisma, 'contract-001', { action: 'decline' }),
    ).rejects.toThrow(/explain|reason|note/i)
  })

  test('a contract with no change request cannot be revised', async () => {
    await expect(
      respondToChangeRequest(prisma, 'contract-002', { action: 'revise', note: 'No.' }),
    ).rejects.toThrow(/not waiting|cannot/i)
  })

  test('both sides of the exchange stay in the history', async () => {
    await clientAsksForAChange('Please move the end date back.')
    await respondToChangeRequest(prisma, 'contract-001', {
      action: 'revise',
      endDate: '2027-04-01',
      note: 'End date brought back a month.',
    })

    const history = await prisma.historyEvent.findMany({
      where: { entityType: 'contract', entityId: 'contract-001' },
      orderBy: { at: 'asc' },
    })
    expect(history.map((h) => h.action)).toEqual([
      'draft_created',
      'issued',
      'change_requested',
      'issued',
    ])
    expect(history.at(-1)?.note).toBe('End date brought back a month.')
  })
})
