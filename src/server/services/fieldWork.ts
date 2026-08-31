import type { PrismaClient, ProofRecord, WorkOrder } from '@prisma/client'
import {
  applyWorkOrderTransition,
  type WorkOrderStatus,
  type WorkOrderTransition,
} from '@/domain/workOrder'
import { now } from '@/domain/clock'
import { newId } from '../ids'
import { notFound, validationError } from '../errors'
import { findExistingEntityId, isUniqueViolation } from '../idempotency'

/**
 * Field work: what a fitter sees and does, and what management creates.
 *
 * Job queries are scoped by assigned user for the same reason client queries
 * are scoped by organisation — a fitter should not be able to read the depot
 * access notes for a job that is not theirs.
 */

/** Proof is held inline as base64 in the prototype, so it is capped small. */
const MAX_PROOF_BYTES = 2_000_000

const ALLOWED_PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

const PROOF_SCOPE = 'work_order_proof'

// ------------------------------------------------------------ fitter queries

export async function listWorkOrdersForFitter(prisma: PrismaClient, userId: string) {
  return prisma.workOrder.findMany({
    where: { assignedUserId: userId, status: { not: 'draft' } },
    include: { asset: true, campaign: true, proofRecords: true },
    orderBy: { scheduledStart: 'asc' },
  })
}

export async function getWorkOrderForFitter(
  prisma: PrismaClient,
  workOrderId: string,
  userId: string,
) {
  const job = await prisma.workOrder.findFirst({
    where: { id: workOrderId, assignedUserId: userId },
    include: {
      asset: true,
      campaign: true,
      contract: true,
      organisation: true,
      proofRecords: { orderBy: { capturedAt: 'asc' } },
    },
  })
  if (!job) throw notFound('That job could not be found.')

  const history = await prisma.historyEvent.findMany({
    where: { entityType: 'work_order', entityId: workOrderId },
    orderBy: { at: 'asc' },
  })

  return { ...job, history }
}

// ------------------------------------------------------------ status changes

/** What the client is told when a job reaches a given state. Silence is the
 *  default: operational detail such as "travelling" is not the client's
 *  business, and a blocked job is management's to explain, not the system's. */
const CLIENT_VISIBLE_COMPLETION = {
  installation: {
    type: 'installation_completed',
    title: 'Installation completed',
    summary: 'Your advertising has been installed and photographed.',
  },
  removal: {
    type: 'removal_completed',
    title: 'Removal completed',
    summary: 'Your advertising has been removed and the site photographed.',
  },
  maintenance: {
    type: 'maintenance_completed',
    title: 'Maintenance completed',
    summary: 'Scheduled maintenance on your advertising has been completed.',
  },
} as const

export async function updateWorkOrderStatus(
  prisma: PrismaClient,
  workOrderId: string,
  userId: string,
  transition: WorkOrderTransition,
): Promise<WorkOrder> {
  const job = await prisma.workOrder.findFirst({
    where: { id: workOrderId, assignedUserId: userId },
    include: { proofRecords: true, campaign: true },
  })
  if (!job) throw notFound('That job could not be found.')

  const outcome = applyWorkOrderTransition(
    { status: job.status as WorkOrderStatus },
    { ...transition, proofCount: job.proofRecords.length },
  )
  if (!outcome.ok) {
    throw validationError('That update could not be saved.', outcome.errors)
  }

  const at = now()

  return prisma.$transaction(async (tx) => {
    const updated = await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        status: outcome.status,
        ...(transition.to === 'blocked'
          ? { blockedReason: transition.blockedReason?.trim() }
          : {}),
        ...(transition.to === 'completed'
          ? { completionNote: transition.completionNote?.trim(), blockedReason: null }
          : {}),
      },
    })

    await tx.historyEvent.create({
      data: {
        entityType: 'work_order',
        entityId: workOrderId,
        at,
        actor: 'fitter',
        action: outcome.status,
        note:
          transition.to === 'blocked'
            ? (transition.blockedReason?.trim() ?? null)
            : transition.to === 'completed'
              ? (transition.completionNote?.trim() ?? null)
              : null,
      },
    })

    if (outcome.status === 'completed') {
      const template =
        CLIENT_VISIBLE_COMPLETION[job.type as keyof typeof CLIENT_VISIBLE_COMPLETION] ??
        CLIENT_VISIBLE_COMPLETION.maintenance

      await tx.serviceEvent.create({
        data: {
          id: newId('event'),
          organisationId: job.organisationId,
          contractId: job.contractId,
          campaignId: job.campaignId,
          workOrderId: job.id,
          at,
          type: template.type,
          title: template.title,
          clientVisible: true,
          // A safe summary, not the fitter's completion note: the note may
          // mention depot staff, access routes or other clients.
          clientSummary: template.summary,
        },
      })

      if (job.campaign) {
        await tx.campaign.update({
          where: { id: job.campaign.id },
          data: { currentStage: 'live' },
        })
      }
    }

    return updated
  })
}

// -------------------------------------------------------------------- proof

export interface ProofInput {
  fileName: string
  mimeType: string
  dataUrl: string
  idempotencyKey: string
}

/**
 * Attach proof of completion.
 *
 * Prototype shortcut: the file is stored inline as a base64 data URL in the
 * database, capped at 2 MB. Production would upload to object storage, scan
 * for malware and serve through a short-lived signed URL — see the
 * productionisation note.
 *
 * The idempotency key is what makes a retry from a phone on weak signal safe:
 * a fitter who cannot tell whether the first upload landed can press the
 * button again without producing two copies of the same photograph.
 */
export async function addProof(
  prisma: PrismaClient,
  workOrderId: string,
  userId: string,
  input: ProofInput,
): Promise<ProofRecord> {
  const job = await prisma.workOrder.findFirst({
    where: { id: workOrderId, assignedUserId: userId },
  })
  if (!job) throw notFound('That job could not be found.')

  const scope = `${PROOF_SCOPE}:${workOrderId}`
  const existingId = await findExistingEntityId(prisma, scope, input.idempotencyKey)
  if (existingId) {
    const existing = await prisma.proofRecord.findUnique({ where: { id: existingId } })
    if (existing) return existing
  }

  if (!ALLOWED_PROOF_TYPES.includes(input.mimeType)) {
    throw validationError('That file type cannot be used as proof.', [
      'Attach a JPEG, PNG, WebP image or PDF.',
    ])
  }

  const base64 = input.dataUrl.split(',')[1] ?? ''
  const sizeBytes = Math.floor((base64.length * 3) / 4)
  if (sizeBytes > MAX_PROOF_BYTES) {
    throw validationError('That file is too large.', [
      `Proof files must be under ${Math.round(MAX_PROOF_BYTES / 1_000_000)} MB in this prototype.`,
    ])
  }
  if (sizeBytes === 0) {
    throw validationError('That file appears to be empty.')
  }

  const id = newId('proof')
  const at = now()

  try {
    return await prisma.$transaction(async (tx) => {
      const proof = await tx.proofRecord.create({
        data: {
          id,
          workOrderId,
          kind: input.mimeType === 'application/pdf' ? 'document' : 'image',
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes,
          dataUrl: input.dataUrl,
          capturedAt: at,
          capturedByUserId: userId,
        },
      })

      await tx.idempotencyRecord.create({
        data: { scope, key: input.idempotencyKey, entityId: id, createdAt: at },
      })

      return proof
    })
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winnerId = await findExistingEntityId(prisma, scope, input.idempotencyKey)
      if (winnerId) {
        const existing = await prisma.proofRecord.findUnique({ where: { id: winnerId } })
        if (existing) return existing
      }
    }
    throw error
  }
}

// ----------------------------------------------------------------- creation

export interface CreateWorkOrderInput {
  campaignId: string
  type: string
  assignedUserId: string | null
  assetId: string | null
  scheduledStart: string
  scheduledEnd: string
  locationLabel: string
  instructions: string
  internalNotes: string | null
}

export async function createWorkOrder(
  prisma: PrismaClient,
  input: CreateWorkOrderInput,
): Promise<WorkOrder> {
  const campaign = await prisma.campaign.findUnique({ where: { id: input.campaignId } })
  if (!campaign) throw notFound('That campaign could not be found.')

  const start = new Date(input.scheduledStart)
  const end = new Date(input.scheduledEnd)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw validationError('Scheduled work must end after it starts.')
  }

  if (input.assignedUserId) {
    const user = await prisma.user.findUnique({ where: { id: input.assignedUserId } })
    if (!user || user.role !== 'fitter') {
      throw validationError('Jobs can only be assigned to a fitter.')
    }
  }

  const id = newId('work-order')
  const at = now()

  return prisma.$transaction(async (tx) => {
    const created = await tx.workOrder.create({
      data: {
        id,
        campaignId: campaign.id,
        contractId: campaign.contractId,
        organisationId: campaign.organisationId,
        type: input.type,
        // A job with nobody assigned is a draft; assigning it is what makes it
        // appear on someone's phone.
        status: input.assignedUserId ? 'assigned' : 'draft',
        assignedUserId: input.assignedUserId,
        assetId: input.assetId,
        scheduledStart: start,
        scheduledEnd: end,
        locationLabel: input.locationLabel,
        instructions: input.instructions,
        internalNotes: input.internalNotes,
        createdAt: at,
      },
    })

    await tx.historyEvent.create({
      data: {
        entityType: 'work_order',
        entityId: id,
        at,
        actor: 'manager',
        action: created.status,
        note: null,
      },
    })

    if (input.assignedUserId) {
      const scheduled = start.toISOString().slice(0, 10)
      await tx.serviceEvent.create({
        data: {
          id: newId('event'),
          organisationId: campaign.organisationId,
          contractId: campaign.contractId,
          campaignId: campaign.id,
          workOrderId: id,
          at,
          type: `${input.type}_scheduled`,
          title: `${input.type} scheduled`,
          clientVisible: true,
          clientSummary: `${input.type === 'installation' ? 'Installation' : 'A site visit'} is planned for ${scheduled}.`,
        },
      })

      await tx.campaign.update({
        where: { id: campaign.id },
        data: { currentStage: `${input.type}_scheduled` },
      })
    }

    return created
  })
}
