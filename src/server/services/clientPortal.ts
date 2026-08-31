import type { PrismaClient, Prisma } from '@prisma/client'
import { applyContractAction, type ContractStatus } from '@/domain/contract'
import {
  blockedReasonLabel,
  capacityPoolAvailability,
  exclusiveAssetAvailability,
} from '@/domain/availability'
import { now } from '@/domain/clock'
import { newId } from '../ids'
import { conflict, notFound, validationError } from '../errors'

/**
 * The client portal.
 *
 * Every function here takes `organisationId` as a required first argument.
 * There is deliberately no un-scoped read path: a caller cannot forget to
 * scope a query, because there is no version of these functions that would let
 * them. A record belonging to another organisation is reported as not found
 * rather than forbidden, so the API does not confirm it exists.
 */

// -------------------------------------------------------------------- shapes

export interface ClientTimelineEvent {
  id: string
  organisationId: string
  at: Date
  type: string
  summary: string
  workOrderId: string | null
  proofs: { id: string; fileName: string; mimeType: string; capturedAt: Date }[]
}

export interface ClientContractView {
  id: string
  status: string
  version: number
  startDate: string
  endDate: string
  currency: string
  total: number
  issuedAt: Date | null
  acceptedAt: Date | null
  items: {
    id: string
    productName: string
    assetName: string | null
    quantity: number
    unitRate: number
    rateUnit: string
    lineTotal: number
  }[]
  campaign: { id: string; name: string; status: string; currentStage: string } | null
  timeline: ClientTimelineEvent[]
  pendingRequests: { id: string; type: string; status: string; summary: string; createdAt: Date }[]
  canAccept: boolean
  canRequestChange: boolean
}

// ------------------------------------------------------------------ queries

export async function listClientContracts(prisma: PrismaClient, organisationId: string) {
  return prisma.contract.findMany({
    where: { organisationId },
    include: { items: { include: { product: true } }, campaigns: true },
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Proof belongs to the moment work was finished.
 *
 * A scheduling event and a completion event share a work order, so attaching
 * proof by work order alone would show the photographs against "installation
 * is planned" and date the evidence wrongly.
 */
const carriesProof = (eventType: string) => eventType.endsWith('_completed')

const toTimelineEvent = (e: {
  id: string
  organisationId: string
  at: Date
  type: string
  title: string
  clientSummary: string | null
  workOrderId: string | null
  workOrder: { proofRecords: { id: string; fileName: string; mimeType: string; capturedAt: Date }[] } | null
}): ClientTimelineEvent => ({
  id: e.id,
  organisationId: e.organisationId,
  at: e.at,
  type: e.type,
  summary: e.clientSummary ?? e.title,
  workOrderId: e.workOrderId,
  proofs: carriesProof(e.type)
    ? (e.workOrder?.proofRecords ?? []).map((p) => ({
        id: p.id,
        fileName: p.fileName,
        mimeType: p.mimeType,
        capturedAt: p.capturedAt,
      }))
    : [],
})

/**
 * Client-visible timeline for one contract.
 *
 * Only events explicitly marked client-visible are returned, and only their
 * safe summary. Internal titles, internal work-order notes and every other
 * organisation's events stay out.
 */
async function clientTimeline(
  prisma: PrismaClient,
  organisationId: string,
  contractId: string,
): Promise<ClientTimelineEvent[]> {
  const events = await prisma.serviceEvent.findMany({
    where: { organisationId, contractId, clientVisible: true },
    orderBy: { at: 'asc' },
    include: { workOrder: { include: { proofRecords: true } } },
  })

  return events.map(toTimelineEvent)
}

export async function getClientContract(
  prisma: PrismaClient,
  organisationId: string,
  contractId: string,
): Promise<ClientContractView> {
  const contract = await prisma.contract.findFirst({
    // Scoping in the WHERE clause, not after the read: another organisation's
    // contract is never loaded into memory in the first place.
    where: { id: contractId, organisationId },
    include: {
      items: { include: { product: true } },
      campaigns: true,
      clientRequests: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!contract) throw notFound('That contract could not be found.')

  const assetIds = contract.items.map((i) => i.assetId).filter((id): id is string => id !== null)
  const assets = assetIds.length
    ? await prisma.asset.findMany({ where: { id: { in: assetIds } } })
    : []
  const assetName = (id: string | null) => assets.find((a) => a.id === id)?.name ?? null

  const campaign = contract.campaigns[0] ?? null

  return {
    id: contract.id,
    status: contract.status,
    version: contract.version,
    startDate: contract.startDate,
    endDate: contract.endDate,
    currency: contract.currency,
    total: contract.total,
    issuedAt: contract.issuedAt,
    acceptedAt: contract.acceptedAt,
    items: contract.items.map((i) => ({
      id: i.id,
      productName: i.product.name,
      assetName: assetName(i.assetId),
      quantity: i.quantity,
      unitRate: i.unitRate,
      rateUnit: i.rateUnit,
      lineTotal: i.lineTotal,
    })),
    campaign: campaign
      ? {
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          currentStage: campaign.currentStage,
        }
      : null,
    timeline: await clientTimeline(prisma, organisationId, contract.id),
    pendingRequests: contract.clientRequests.map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      summary: r.summary,
      createdAt: r.createdAt,
    })),
    canAccept: contract.status === 'issued',
    canRequestChange: contract.status === 'issued',
  }
}

/**
 * Something the client has to act on.
 *
 * One list rather than one per entity, because the client does not think in
 * entities — they think "what is waiting on me".
 */
export interface ClientAction {
  kind: 'contract' | 'booking_request'
  id: string
  label: string
  detail: string | null
}

export interface ClientSummary {
  organisation: { id: string; name: string }
  hasContracts: boolean
  contracts: { id: string; status: string; startDate: string; endDate: string; total: number }[]
  bookingRequests: {
    id: string
    status: string
    productName: string
    startDate: string
    endDate: string
    /** True when the agency has asked a question and is waiting on an answer. */
    awaitingYou: boolean
    /** The agency's question, so the client can answer it without hunting. */
    question: string | null
  }[]
  actionsRequired: ClientAction[]
  shortlistCount: number
  recentEvents: ClientTimelineEvent[]
}

/**
 * The portal home.
 *
 * An account with no contracts is the normal state for a client who has just
 * registered, not an error. The summary is shaped so that such an account
 * still has something to read and somewhere to go.
 */
export async function getClientSummary(
  prisma: PrismaClient,
  organisationId: string,
): Promise<ClientSummary> {
  const organisation = await prisma.organisation.findUnique({ where: { id: organisationId } })
  if (!organisation) throw notFound('That account could not be found.')

  const [contracts, requests, shortlistCount, events, queries] = await Promise.all([
    prisma.contract.findMany({ where: { organisationId }, orderBy: { createdAt: 'desc' } }),
    prisma.bookingRequest.findMany({
      where: { organisationId },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.shortlistItem.count({ where: { organisationId } }),
    prisma.serviceEvent.findMany({
      where: { organisationId, clientVisible: true },
      orderBy: { at: 'desc' },
      take: 5,
      include: { workOrder: { include: { proofRecords: true } } },
    }),
    // The agency's questions, newest first, so each request can show the one
    // it is actually waiting on.
    prisma.historyEvent.findMany({
      where: { entityType: 'booking_request', action: 'information_required' },
      orderBy: { at: 'desc' },
    }),
  ])

  const questionFor = (requestId: string) =>
    queries.find((q) => q.entityId === requestId)?.note ?? null

  return {
    organisation: { id: organisation.id, name: organisation.name },
    hasContracts: contracts.length > 0,
    contracts: contracts.map((c) => ({
      id: c.id,
      status: c.status,
      startDate: c.startDate,
      endDate: c.endDate,
      total: c.total,
    })),
    bookingRequests: requests.map((r) => ({
      id: r.id,
      status: r.status,
      productName: r.product.name,
      startDate: r.startDate,
      endDate: r.endDate,
      awaitingYou: r.status === 'information_required',
      question: r.status === 'information_required' ? questionFor(r.id) : null,
    })),
    actionsRequired: [
      ...contracts
        .filter((c) => c.status === 'issued')
        .map<ClientAction>((c) => ({
          kind: 'contract',
          id: c.id,
          label: 'Contract ready to review',
          detail: null,
        })),
      ...requests
        .filter((r) => r.status === 'information_required')
        .map<ClientAction>((r) => ({
          kind: 'booking_request',
          id: r.id,
          label: `We need a little more about your ${r.product.name} enquiry`,
          detail: questionFor(r.id),
        })),
    ],
    shortlistCount,
    recentEvents: events.map(toTimelineEvent),
  }
}

// ------------------------------------------------------------------- actions

/**
 * Rechecks that every asset on the contract is still free for the contract
 * dates, ignoring bookings this contract's own campaign already holds.
 *
 * This is the rule that makes acceptance safe: between issue and acceptance,
 * someone else may have taken the inventory. The check runs inside the
 * acceptance transaction, so it cannot go stale between check and write.
 */
async function assertInventoryStillFree(
  tx: Prisma.TransactionClient,
  contract: { id: string; startDate: string; endDate: string },
  items: { productId: string; assetId: string | null }[],
): Promise<void> {
  const at = now()
  const range = { startDate: contract.startDate, endDate: contract.endDate }

  for (const item of items) {
    const product = await tx.product.findUniqueOrThrow({
      where: { id: item.productId },
      include: {
        assets: { include: { outages: true } },
        capacityPools: true,
        bookings: true,
        holds: true,
      },
    })

    if (product.allocationModel === 'capacity_pool') {
      const pool = product.capacityPools[0]
      const result = capacityPoolAvailability({
        range,
        now: at,
        capacity: pool?.capacity ?? 0,
        bookings: product.bookings.filter((b) => b.capacityPoolId === pool?.id),
        holds: product.holds.filter((h) => h.capacityPoolId === pool?.id),
      })
      if (!result.available) {
        throw conflict(
          `${product.name} is no longer available for these dates. The shared capacity is now full.`,
        )
      }
      continue
    }

    const candidates = item.assetId
      ? product.assets.filter((a) => a.id === item.assetId)
      : product.assets

    const result = exclusiveAssetAvailability({
      range,
      now: at,
      assets: candidates,
      bookings: product.bookings,
      holds: product.holds,
      outages: candidates.flatMap((a) => a.outages),
    })

    if (!result.available) {
      const blocked = result.candidates[0]
      throw conflict(
        `${product.name} is no longer available for these dates.`,
        blocked?.blockedBy ? [`${blocked.assetName} ${blockedReasonLabel(blocked.blockedBy)}.`] : [],
      )
    }
  }
}

export type ClientContractAction =
  | { action: 'accept' }
  | { action: 'request_change'; note?: string }

export async function actOnContract(
  prisma: PrismaClient,
  organisationId: string,
  contractId: string,
  request: ClientContractAction,
) {
  const contract = await prisma.contract.findFirst({
    where: { id: contractId, organisationId },
    include: { items: true, campaigns: true },
  })
  if (!contract) throw notFound('That contract could not be found.')

  const outcome = applyContractAction(
    { status: contract.status as ContractStatus, version: contract.version },
    request.action,
    'client',
  )
  if (!outcome.ok) throw conflict(outcome.reason)

  const at = now()

  if (request.action === 'request_change') {
    const note = request.note?.trim()
    if (!note) {
      throw validationError('Please describe the change you need.', [
        'A change request needs a short explanation so the team can act on it.',
      ])
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.contract.update({
        where: { id: contract.id },
        // Status only. Terms, dates, items and total are untouched: a client
        // action must never silently rewrite an issued contract.
        data: { status: outcome.status },
      })

      await tx.clientRequest.create({
        data: {
          id: newId('client-request'),
          organisationId,
          contractId: contract.id,
          type: 'contract_change',
          status: 'submitted',
          createdAt: at,
          summary: note,
        },
      })

      await tx.historyEvent.create({
        data: {
          entityType: 'contract',
          entityId: contract.id,
          at,
          actor: 'client',
          action: 'change_requested',
          note,
        },
      })

      return updated
    })
  }

  return prisma.$transaction(async (tx) => {
    await assertInventoryStillFree(tx, contract, contract.items)

    const updated = await tx.contract.update({
      where: { id: contract.id },
      data: { status: outcome.status, version: outcome.version, acceptedAt: at },
    })

    // Acceptance turns the agreement into delivery: confirm the inventory and
    // put the campaign into an active state.
    const campaign = contract.campaigns[0]
    for (const item of contract.items) {
      const bookingId = newId('booking')
      await tx.booking.create({
        data: {
          id: bookingId,
          campaignName: campaign?.name ?? null,
          productId: item.productId,
          assetId: item.assetId,
          startDate: contract.startDate,
          endDate: contract.endDate,
          status: 'confirmed',
        },
      })

      if (campaign && !campaign.bookingId) {
        await tx.campaign.update({
          where: { id: campaign.id },
          data: { bookingId, status: 'active', currentStage: 'contract_accepted' },
        })
      }
    }

    await tx.historyEvent.create({
      data: {
        entityType: 'contract',
        entityId: contract.id,
        at,
        actor: 'client',
        action: 'accepted',
        note: null,
      },
    })

    await tx.serviceEvent.create({
      data: {
        id: newId('event'),
        organisationId,
        contractId: contract.id,
        campaignId: campaign?.id ?? null,
        workOrderId: null,
        at,
        type: 'contract_accepted',
        title: 'Contract accepted',
        clientVisible: true,
        clientSummary: 'Your advertising contract has been accepted.',
      },
    })

    return updated
  })
}

/**
 * Answer the agency's question about an enquiry.
 *
 * A manager can set a request to `information_required` with a note; without
 * this the client could see the badge but not the question, and had no way to
 * reply — the request would sit in both queues waiting on the other side.
 *
 * Answering returns the request to `submitted`, so it re-enters the agency's
 * decision queue. The question and the answer both stay in the history, which
 * is where the record of the exchange belongs.
 */
export async function respondToInformationRequest(
  prisma: PrismaClient,
  organisationId: string,
  requestId: string,
  answer: string,
) {
  const request = await prisma.bookingRequest.findFirst({
    where: { id: requestId, organisationId },
  })
  if (!request) throw notFound('That enquiry could not be found.')

  if (request.status !== 'information_required') {
    throw conflict('This enquiry is not waiting on you at the moment.')
  }

  const note = answer.trim()
  if (!note) {
    throw validationError('Add your answer before sending.', [
      'The team asked a question; a short answer is enough.',
    ])
  }

  const at = now()

  return prisma.$transaction(async (tx) => {
    const updated = await tx.bookingRequest.update({
      where: { id: requestId },
      data: { status: 'submitted' },
    })

    await tx.historyEvent.create({
      data: {
        entityType: 'booking_request',
        entityId: requestId,
        at,
        actor: 'client',
        action: 'information_supplied',
        note,
      },
    })

    return updated
  })
}
