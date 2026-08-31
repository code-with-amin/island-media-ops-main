import { afterAll, beforeEach, describe, expect, test } from 'vitest'
import { createTestPrisma, resetTestDb } from '../helpers/testDb'
import {
  addProof,
  createWorkOrder,
  getWorkOrderForFitter,
  listWorkOrdersForFitter,
  updateWorkOrderStatus,
} from '@/server/services/fieldWork'
import { getClientContract } from '@/server/services/clientPortal'

const prisma = createTestPrisma()

beforeEach(async () => {
  await resetTestDb(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

const FITTER = 'user-fitter-01'
const WO = 'work-order-001'

const PROOF = {
  fileName: 'van-12-rear.jpg',
  mimeType: 'image/jpeg',
  dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ',
}

async function reachOnSite() {
  await updateWorkOrderStatus(prisma, WO, FITTER, { to: 'travelling' })
  await updateWorkOrderStatus(prisma, WO, FITTER, { to: 'on_site' })
}

// ------------------------------------------------------- assignment scoping

describe('listWorkOrdersForFitter', () => {
  test('returns the jobs assigned to that fitter', async () => {
    const jobs = await listWorkOrdersForFitter(prisma, FITTER)
    expect(jobs.map((j) => j.id)).toEqual([WO])
  })

  test('returns nothing for a fitter with no assignments', async () => {
    const jobs = await listWorkOrdersForFitter(prisma, 'user-manager-01')
    expect(jobs).toEqual([])
  })

  test('a fitter cannot open a job assigned to someone else', async () => {
    await expect(getWorkOrderForFitter(prisma, WO, 'user-manager-01')).rejects.toThrow(
      /not be found/i,
    )
  })

  test('the assigned fitter sees the internal instructions for their job', async () => {
    const job = await getWorkOrderForFitter(prisma, WO, FITTER)
    expect(job.internalNotes).toContain('Depot contact')
  })
})

// ------------------------------------------------------------ status changes

describe('updateWorkOrderStatus', () => {
  test('moves an assigned job to travelling and records history', async () => {
    const updated = await updateWorkOrderStatus(prisma, WO, FITTER, { to: 'travelling' })
    expect(updated.status).toBe('travelling')

    const history = await prisma.historyEvent.findMany({
      where: { entityType: 'work_order', entityId: WO },
      orderBy: { at: 'asc' },
    })
    expect(history.at(-1)?.action).toBe('travelling')
    expect(history.at(-1)?.actor).toBe('fitter')
  })

  test('refuses to block a job without a reason', async () => {
    await reachOnSite()
    await expect(updateWorkOrderStatus(prisma, WO, FITTER, { to: 'blocked' })).rejects.toThrow(
      /needs a reason/i,
    )
  })

  test('blocks a job with a reason and stores it', async () => {
    await reachOnSite()
    const updated = await updateWorkOrderStatus(prisma, WO, FITTER, {
      to: 'blocked',
      blockedReason: 'Depot gate locked, no key holder on site.',
    })

    expect(updated.status).toBe('blocked')
    expect(updated.blockedReason).toBe('Depot gate locked, no key holder on site.')
  })

  test('a blocked job is visible to management with its reason', async () => {
    await reachOnSite()
    await updateWorkOrderStatus(prisma, WO, FITTER, {
      to: 'blocked',
      blockedReason: 'Depot gate locked.',
    })

    const job = await prisma.workOrder.findUniqueOrThrow({ where: { id: WO } })
    expect(job.status).toBe('blocked')
    expect(job.blockedReason).toBe('Depot gate locked.')
  })

  test('refuses to complete without proof', async () => {
    await reachOnSite()
    await expect(
      updateWorkOrderStatus(prisma, WO, FITTER, {
        to: 'completed',
        completionNote: 'Panel fitted.',
      }),
    ).rejects.toThrow(/proof/i)
  })

  test('refuses to complete without a note', async () => {
    await reachOnSite()
    await addProof(prisma, WO, FITTER, { ...PROOF, idempotencyKey: 'proof-1' })
    await expect(
      updateWorkOrderStatus(prisma, WO, FITTER, { to: 'completed' }),
    ).rejects.toThrow(/completion note/i)
  })

  test('completes with a note and proof, and records a service event', async () => {
    await reachOnSite()
    await addProof(prisma, WO, FITTER, { ...PROOF, idempotencyKey: 'proof-1' })

    const updated = await updateWorkOrderStatus(prisma, WO, FITTER, {
      to: 'completed',
      completionNote: 'Panel fitted and photographed.',
    })

    expect(updated.status).toBe('completed')
    expect(updated.completionNote).toBe('Panel fitted and photographed.')

    const events = await prisma.serviceEvent.findMany({
      where: { workOrderId: WO, type: 'installation_completed' },
    })
    expect(events).toHaveLength(1)
    expect(events[0]?.clientVisible).toBe(true)
  })

  test('proof is attached to the completion event only, not to earlier events', async () => {
    // The scheduling event and the completion event share a work order. Proof
    // belongs to the moment the work was done, so showing it against
    // "installation is planned" would date the evidence wrongly.
    await reachOnSite()
    await addProof(prisma, WO, FITTER, { ...PROOF, idempotencyKey: 'proof-1' })
    await updateWorkOrderStatus(prisma, WO, FITTER, {
      to: 'completed',
      completionNote: 'Panel fitted and photographed.',
    })

    const contract = await getClientContract(prisma, 'org-oak-legal', 'contract-002')

    const scheduled = contract.timeline.find((e) => e.type === 'installation_scheduled')
    const completed = contract.timeline.find((e) => e.type === 'installation_completed')

    expect(scheduled?.proofs).toEqual([])
    expect(completed?.proofs).toHaveLength(1)
  })

  test('the client sees the completion and its proof, but no internal notes', async () => {
    await reachOnSite()
    await addProof(prisma, WO, FITTER, { ...PROOF, idempotencyKey: 'proof-1' })
    await updateWorkOrderStatus(prisma, WO, FITTER, {
      to: 'completed',
      completionNote: 'Panel fitted and photographed.',
    })

    const contract = await getClientContract(prisma, 'org-oak-legal', 'contract-002')
    const completion = contract.timeline.find((e) => e.type === 'installation_completed')

    expect(completion).toBeDefined()
    expect(completion?.proofs).toHaveLength(1)
    expect(completion?.proofs[0]?.fileName).toBe('van-12-rear.jpg')

    const serialised = JSON.stringify(contract)
    expect(serialised).not.toContain('Depot contact')
  })
})

// -------------------------------------------------------------------- proof

describe('addProof', () => {
  test('attaches a proof record to the job', async () => {
    const proof = await addProof(prisma, WO, FITTER, { ...PROOF, idempotencyKey: 'proof-1' })
    expect(proof.fileName).toBe('van-12-rear.jpg')
    expect(proof.sizeBytes).toBeGreaterThan(0)
  })

  test('a repeated upload with the same key does not create a second record', async () => {
    // A fitter on weak signal retries an upload that may already have landed.
    await addProof(prisma, WO, FITTER, { ...PROOF, idempotencyKey: 'proof-1' })
    await addProof(prisma, WO, FITTER, { ...PROOF, idempotencyKey: 'proof-1' })

    const proofs = await prisma.proofRecord.findMany({ where: { workOrderId: WO } })
    expect(proofs).toHaveLength(1)
  })

  test('a different key adds a second proof', async () => {
    await addProof(prisma, WO, FITTER, { ...PROOF, idempotencyKey: 'proof-1' })
    await addProof(prisma, WO, FITTER, { ...PROOF, idempotencyKey: 'proof-2' })

    const proofs = await prisma.proofRecord.findMany({ where: { workOrderId: WO } })
    expect(proofs).toHaveLength(2)
  })

  test('rejects a file that is not an image or document', async () => {
    await expect(
      addProof(prisma, WO, FITTER, {
        ...PROOF,
        mimeType: 'application/x-msdownload',
        idempotencyKey: 'proof-bad',
      }),
    ).rejects.toThrow(/image or pdf/i)
  })

  test('rejects an oversized upload', async () => {
    await expect(
      addProof(prisma, WO, FITTER, {
        ...PROOF,
        dataUrl: `data:image/jpeg;base64,${'A'.repeat(3_000_000)}`,
        idempotencyKey: 'proof-big',
      }),
    ).rejects.toThrow(/too large/i)
  })
})

// ------------------------------------------------------- creation by manager

describe('createWorkOrder', () => {
  test('a new job appears in the assigned fitter list', async () => {
    const created = await createWorkOrder(prisma, {
      campaignId: 'campaign-002',
      type: 'maintenance',
      assignedUserId: FITTER,
      assetId: 'asset-van-12',
      scheduledStart: '2027-01-20T09:00:00Z',
      scheduledEnd: '2027-01-20T11:00:00Z',
      locationLabel: 'ParcelFleet East depot',
      instructions: 'Check panel edges after first week.',
      internalNotes: 'Depot key code with the supervisor.',
    })

    expect(created.status).toBe('assigned')

    const jobs = await listWorkOrdersForFitter(prisma, FITTER)
    expect(jobs.map((j) => j.id)).toContain(created.id)
  })

  test('tells the client that work has been scheduled', async () => {
    const created = await createWorkOrder(prisma, {
      campaignId: 'campaign-002',
      type: 'installation',
      assignedUserId: FITTER,
      assetId: 'asset-van-12',
      scheduledStart: '2027-01-20T09:00:00Z',
      scheduledEnd: '2027-01-20T11:00:00Z',
      locationLabel: 'ParcelFleet East depot',
      instructions: 'Fit approved rear panel.',
      internalNotes: null,
    })

    const events = await prisma.serviceEvent.findMany({ where: { workOrderId: created.id } })
    expect(events[0]?.type).toBe('installation_scheduled')
    expect(events[0]?.clientVisible).toBe(true)
  })

  test('refuses a job that ends before it starts', async () => {
    await expect(
      createWorkOrder(prisma, {
        campaignId: 'campaign-002',
        type: 'installation',
        assignedUserId: FITTER,
        assetId: 'asset-van-12',
        scheduledStart: '2027-01-20T11:00:00Z',
        scheduledEnd: '2027-01-20T09:00:00Z',
        locationLabel: 'Depot',
        instructions: 'Fit panel.',
        internalNotes: null,
      }),
    ).rejects.toThrow(/end after it starts/i)
  })

  test('refuses to assign a job to someone who is not a fitter', async () => {
    await expect(
      createWorkOrder(prisma, {
        campaignId: 'campaign-002',
        type: 'installation',
        assignedUserId: 'user-client-oaklegal',
        assetId: 'asset-van-12',
        scheduledStart: '2027-01-20T09:00:00Z',
        scheduledEnd: '2027-01-20T11:00:00Z',
        locationLabel: 'Depot',
        instructions: 'Fit panel.',
        internalNotes: null,
      }),
    ).rejects.toThrow(/fitter/i)
  })
})
