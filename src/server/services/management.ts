import type { Prisma, PrismaClient } from '@prisma/client'
import { isValidRange, rangeLengthDays, type DateRange } from '@/domain/dates'
import {
  blockedReasonLabel,
  capacityPoolAvailability,
  exclusiveAssetAvailability,
  meetsMinimumTerm,
} from '@/domain/availability'
import { applyContractAction, type ContractStatus } from '@/domain/contract'
import { now } from '@/domain/clock'
import { newId } from '../ids'
import { conflict, notFound, validationError } from '../errors'
import type { Availability } from './catalogue'

/**
 * The management surface.
 *
 * Availability is recomputed here rather than read from a cached flag,
 * because the answer changes as other bookings land. Approval and contract
 * activation both recheck inside a transaction — the brief requires it, and
 * without it two managers can approve the same asset for the same window.
 */

/** Inventory verified longer ago than this is flagged before it is committed. */
const STALE_VERIFICATION_DAYS = 30

const DAY_MS = 86_400_000

// ------------------------------------------------------------------ dashboard

export interface Dashboard {
  awaitingDecision: {
    id: string
    advertiserName: string
    productName: string
    startDate: string
    endDate: string
    createdAt: Date
  }[]
  awaitingClient: { id: string; organisationName: string; total: number; issuedAt: Date | null }[]
  clientRequests: {
    id: string
    organisationId: string
    organisationName: string
    type: string
    status: string
    summary: string
    createdAt: Date
  }[]
  upcomingWork: {
    id: string
    type: string
    status: string
    scheduledStart: Date
    locationLabel: string
    assignedTo: string | null
  }[]
  blockedWork: { id: string; blockedReason: string | null; locationLabel: string }[]
}

/**
 * The management home, ordered by what needs a person.
 *
 * A manager opening the system should see decisions waiting on them first,
 * then work waiting on someone else, then work already moving. A list of every
 * entity in the database would be a worse answer to the same question.
 */
export async function getDashboard(prisma: PrismaClient): Promise<Dashboard> {
  const [requests, contracts, clientRequests, workOrders] = await Promise.all([
    prisma.bookingRequest.findMany({
      where: { status: { in: ['submitted', 'information_required'] } },
      include: { product: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.contract.findMany({
      where: { status: { in: ['issued', 'change_requested'] } },
      include: { organisation: true },
      orderBy: { issuedAt: 'asc' },
    }),
    prisma.clientRequest.findMany({
      where: { status: 'submitted' },
      include: { organisation: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.workOrder.findMany({
      where: { status: { in: ['draft', 'assigned', 'travelling', 'on_site', 'blocked'] } },
      include: { assignedUser: true },
      orderBy: { scheduledStart: 'asc' },
    }),
  ])

  return {
    awaitingDecision: requests.map((r) => ({
      id: r.id,
      advertiserName: r.advertiserName,
      productName: r.product.name,
      startDate: r.startDate,
      endDate: r.endDate,
      createdAt: r.createdAt,
    })),
    awaitingClient: contracts.map((c) => ({
      id: c.id,
      organisationName: c.organisation.name,
      total: c.total,
      issuedAt: c.issuedAt,
    })),
    clientRequests: clientRequests.map((r) => ({
      id: r.id,
      organisationId: r.organisationId,
      organisationName: r.organisation.name,
      type: r.type,
      status: r.status,
      summary: r.summary,
      createdAt: r.createdAt,
    })),
    upcomingWork: workOrders.map((w) => ({
      id: w.id,
      type: w.type,
      status: w.status,
      scheduledStart: w.scheduledStart,
      locationLabel: w.locationLabel,
      assignedTo: w.assignedUser?.name ?? null,
    })),
    blockedWork: workOrders
      .filter((w) => w.status === 'blocked')
      .map((w) => ({ id: w.id, blockedReason: w.blockedReason, locationLabel: w.locationLabel })),
  }
}

// ------------------------------------------------------- availability helpers

const availabilityInclude = {
  assets: { include: { outages: true } },
  capacityPools: true,
  bookings: true,
  holds: true,
} as const

async function computeAvailability(
  tx: Prisma.TransactionClient | PrismaClient,
  productId: string,
  range: DateRange,
  restrictToAssetId?: string | null,
): Promise<Availability> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    include: availabilityInclude,
  })
  if (!product) throw notFound('That product could not be found.')

  const at = now()

  if (product.allocationModel === 'capacity_pool') {
    const pool = product.capacityPools[0]
    return capacityPoolAvailability({
      range,
      now: at,
      capacity: pool?.capacity ?? 0,
      bookings: product.bookings.filter((b) => b.capacityPoolId === pool?.id),
      holds: product.holds.filter((h) => h.capacityPoolId === pool?.id),
    })
  }

  const assets = restrictToAssetId
    ? product.assets.filter((a) => a.id === restrictToAssetId)
    : product.assets

  return exclusiveAssetAvailability({
    range,
    now: at,
    assets,
    bookings: product.bookings,
    holds: product.holds,
    outages: assets.flatMap((a) => a.outages),
  })
}

export interface StaleVerificationWarning {
  assetId: string
  assetName: string
  verifiedAt: Date | null
  verificationSource: string | null
  daysSinceVerified: number | null
}

/**
 * Inventory whose availability has not been confirmed with the media owner
 * recently. Not a blocker — a manager may know better — but committing a
 * client to an asset nobody has checked is an expensive mistake to make
 * silently.
 */
async function staleVerification(
  prisma: PrismaClient,
  productId: string,
): Promise<StaleVerificationWarning[]> {
  const assets = await prisma.asset.findMany({ where: { productId, status: 'active' } })
  const at = now().getTime()

  return assets
    .map((a) => ({
      assetId: a.id,
      assetName: a.name,
      verifiedAt: a.verifiedAt,
      verificationSource: a.verificationSource,
      daysSinceVerified: a.verifiedAt
        ? Math.floor((at - a.verifiedAt.getTime()) / DAY_MS)
        : null,
    }))
    .filter((a) => a.daysSinceVerified === null || a.daysSinceVerified > STALE_VERIFICATION_DAYS)
}

// ----------------------------------------------------------- booking requests

export async function listBookingRequests(prisma: PrismaClient, status?: string) {
  return prisma.bookingRequest.findMany({
    where: status ? { status } : {},
    include: { product: true, organisation: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getBookingRequestDetail(prisma: PrismaClient, requestId: string) {
  const request = await prisma.bookingRequest.findUnique({
    where: { id: requestId },
    include: { product: true, organisation: true },
  })
  if (!request) throw notFound('That request could not be found.')

  const range = { startDate: request.startDate, endDate: request.endDate }

  const [availability, warnings, history, existingContract] = await Promise.all([
    computeAvailability(prisma, request.productId, range, request.requestedAssetId),
    staleVerification(prisma, request.productId),
    prisma.historyEvent.findMany({
      where: { entityType: 'booking_request', entityId: requestId },
      orderBy: { at: 'asc' },
    }),
    // A request produces at most one live contract; showing it here is what
    // stops a manager drafting a second one by revisiting the page.
    prisma.contract.findFirst({
      where: { bookingRequestId: requestId, status: { not: 'cancelled' } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return {
    ...request,
    requestedDays: rangeLengthDays(range),
    meetsMinimumTerm: meetsMinimumTerm(range, request.product.minimumTermDays),
    availability,
    staleVerificationWarnings: warnings,
    history,
    existingContract,
    isDecided: !['submitted', 'information_required'].includes(request.status),
  }
}

export type RequestDecision =
  | { decision: 'approve'; assetId?: string | null; note?: string }
  | { decision: 'decline'; note?: string }
  | { decision: 'request_information'; note?: string }

const DECISION_STATUS = {
  approve: 'approved',
  decline: 'declined',
  request_information: 'information_required',
} as const

export async function decideBookingRequest(
  prisma: PrismaClient,
  requestId: string,
  decision: RequestDecision,
) {
  const request = await prisma.bookingRequest.findUnique({
    where: { id: requestId },
    include: { product: true },
  })
  if (!request) throw notFound('That request could not be found.')

  if (!['submitted', 'information_required'].includes(request.status)) {
    throw conflict(`This request has already been ${request.status}.`)
  }

  if (decision.decision === 'request_information' && !decision.note?.trim()) {
    throw validationError('Add a note explaining what you need from the client.')
  }

  const at = now()

  return prisma.$transaction(async (tx) => {
    if (decision.decision === 'approve') {
      // The recheck runs inside the transaction, so it cannot go stale between
      // reading availability and writing the approval.
      const assetId = decision.assetId ?? request.requestedAssetId
      const availability = await computeAvailability(
        tx,
        request.productId,
        { startDate: request.startDate, endDate: request.endDate },
        assetId,
      )

      if (!availability.available) {
        const detail =
          availability.allocationModel === 'exclusive_asset'
            ? availability.candidates.flatMap((c) =>
                c.blockedBy ? [`${c.assetName} ${blockedReasonLabel(c.blockedBy)}.`] : [],
              )
            : [`The shared capacity is full: ${availability.peakUsed} of ${availability.capacity}.`]

        throw conflict(
          `${request.product.name} is not available for ${request.startDate} to ${request.endDate}.`,
          detail,
        )
      }
    }

    const updated = await tx.bookingRequest.update({
      where: { id: requestId },
      data: {
        status: DECISION_STATUS[decision.decision],
        ...(decision.decision === 'approve' && decision.assetId
          ? { requestedAssetId: decision.assetId }
          : {}),
      },
    })

    await tx.historyEvent.create({
      data: {
        entityType: 'booking_request',
        entityId: requestId,
        at,
        actor: 'manager',
        action: DECISION_STATUS[decision.decision],
        note: decision.note?.trim() || null,
      },
    })

    return updated
  })
}

// ---------------------------------------------------------------- contracts

/**
 * Contract value for the requested period.
 *
 * Uses the product's indicative monthly equivalent, pro-rated across the
 * booked days. A price-on-request product has no figure to work from and is
 * refused rather than priced at zero.
 */
function contractTotal(monthlyEquivalent: number | null, range: DateRange): number {
  if (monthlyEquivalent === null) {
    throw validationError(
      'This product is priced on request. Agree a rate with the media owner before drafting a contract.',
    )
  }
  const months = rangeLengthDays(range) / 30
  return Math.round(monthlyEquivalent * months * 100) / 100
}

export async function createContractFromRequest(
  prisma: PrismaClient,
  requestId: string,
  options: { assetId?: string | null } = {},
) {
  const request = await prisma.bookingRequest.findUnique({
    where: { id: requestId },
    include: { product: true },
  })
  if (!request) throw notFound('That request could not be found.')
  if (request.status !== 'approved') {
    throw conflict('Approve the request before drafting a contract.')
  }
  if (!request.organisationId) {
    throw validationError('This request has no client account attached.')
  }

  // An idempotency key only protects a single attempt. A manager returning to
  // an approved request later presents a genuinely new key, so the "one
  // contract per request" rule has to be enforced against the data.
  const existing = await prisma.contract.findFirst({
    where: { bookingRequestId: request.id, status: { not: 'cancelled' } },
  })
  if (existing) {
    throw conflict(`This request already has a contract (${existing.id}).`, [
      `It is currently ${existing.status.replace(/_/g, ' ')}. Open that contract rather than drafting a second one.`,
    ])
  }

  const range = { startDate: request.startDate, endDate: request.endDate }
  const assetId = options.assetId ?? request.requestedAssetId
  const total = contractTotal(request.product.rateMonthlyEquivalent, range)
  const at = now()
  const contractId = newId('contract')

  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.create({
      data: {
        id: contractId,
        organisationId: request.organisationId as string,
        bookingRequestId: request.id,
        status: 'draft',
        version: 1,
        startDate: range.startDate,
        endDate: range.endDate,
        currency: request.product.rateCurrency ?? 'GBP',
        total,
        createdAt: at,
        items: {
          create: [
            {
              id: newId('contract-item'),
              productId: request.productId,
              assetId,
              quantity: 1,
              unitRate: request.product.rateMonthlyEquivalent ?? 0,
              rateUnit: request.product.rateUnit ?? 'month',
              lineTotal: total,
            },
          ],
        },
      },
    })

    await tx.historyEvent.create({
      data: {
        entityType: 'contract',
        entityId: contractId,
        at,
        actor: 'manager',
        action: 'draft_created',
        note: null,
      },
    })

    return contract
  })
}

/**
 * Issue a draft to the client.
 *
 * This is the point the contract becomes visible in the portal, so it is also
 * the point the campaign record appears — awaiting acceptance, with no booking
 * yet, because nothing is committed until the client accepts.
 */
export async function issueContract(prisma: PrismaClient, contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { campaigns: true, items: { include: { product: true } } },
  })
  if (!contract) throw notFound('That contract could not be found.')

  const outcome = applyContractAction(
    { status: contract.status as ContractStatus, version: contract.version },
    'issue',
    'manager',
  )
  if (!outcome.ok) throw conflict(outcome.reason)

  const at = now()

  return prisma.$transaction(async (tx) => {
    const updated = await tx.contract.update({
      where: { id: contractId },
      data: { status: outcome.status, version: outcome.version, issuedAt: at },
    })

    let campaignId = contract.campaigns[0]?.id ?? null
    if (!campaignId) {
      campaignId = newId('campaign')
      await tx.campaign.create({
        data: {
          id: campaignId,
          organisationId: contract.organisationId,
          contractId: contract.id,
          bookingId: null,
          name: `${contract.items[0]?.product.name ?? 'Campaign'} — ${contract.startDate}`,
          status: 'awaiting_contract_acceptance',
          currentStage: 'contract_issued',
          clientVisible: true,
        },
      })
    }

    await tx.historyEvent.create({
      data: {
        entityType: 'contract',
        entityId: contractId,
        at,
        actor: 'manager',
        action: 'issued',
        note: 'Issued for client review.',
      },
    })

    await tx.serviceEvent.create({
      data: {
        id: newId('event'),
        organisationId: contract.organisationId,
        contractId: contract.id,
        campaignId,
        workOrderId: null,
        at,
        type: 'contract_issued',
        title: 'Contract ready for review',
        clientVisible: true,
        clientSummary: 'Your contract is ready to review.',
      },
    })

    return updated
  })
}

// ------------------------------------------------------- internal detail views

/**
 * The internal view of a contract.
 *
 * Deliberately not organisation-scoped: a manager coordinates every client's
 * work, so scoping here would be wrong rather than safe. The client-facing
 * equivalent in clientPortal.ts takes organisationId as a required argument
 * and is the only path a client can reach.
 */
export async function getContractDetail(prisma: PrismaClient, contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      organisation: true,
      bookingRequest: { include: { product: true } },
      items: { include: { product: true } },
      campaigns: { include: { booking: true } },
      clientRequests: { orderBy: { createdAt: 'desc' } },
      workOrders: {
        include: { assignedUser: true, asset: true, proofRecords: true },
        orderBy: { scheduledStart: 'asc' },
      },
      serviceEvents: { orderBy: { at: 'asc' } },
    },
  })
  if (!contract) throw notFound('That contract could not be found.')

  const assetIds = contract.items.map((i) => i.assetId).filter((id): id is string => id !== null)
  const assets = assetIds.length
    ? await prisma.asset.findMany({ where: { id: { in: assetIds } } })
    : []

  const history = await prisma.historyEvent.findMany({
    where: { entityType: 'contract', entityId: contractId },
    orderBy: { at: 'asc' },
  })

  return { ...contract, assets, history }
}

export async function listContracts(prisma: PrismaClient, status?: string) {
  return prisma.contract.findMany({
    where: status ? { status } : {},
    include: { organisation: true, items: { include: { product: true } }, campaigns: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function listClients(prisma: PrismaClient) {
  return prisma.organisation.findMany({
    include: {
      contracts: true,
      bookingRequests: true,
      users: true,
    },
    orderBy: { name: 'asc' },
  })
}

/** Everything about one client account, including accounts with nothing yet. */
export async function getClientDetail(prisma: PrismaClient, organisationId: string) {
  const organisation = await prisma.organisation.findUnique({ where: { id: organisationId } })
  if (!organisation) throw notFound('That client could not be found.')

  const [users, contracts, bookingRequests, campaigns, clientRequests, serviceEvents] =
    await Promise.all([
      prisma.user.findMany({ where: { organisationId }, orderBy: { name: 'asc' } }),
      prisma.contract.findMany({
        where: { organisationId },
        include: { items: { include: { product: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.bookingRequest.findMany({
        where: { organisationId },
        include: { product: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.campaign.findMany({ where: { organisationId } }),
      prisma.clientRequest.findMany({
        where: { organisationId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.serviceEvent.findMany({
        where: { organisationId },
        orderBy: { at: 'desc' },
        take: 10,
      }),
    ])

  return { organisation, users, contracts, bookingRequests, campaigns, clientRequests, serviceEvents }
}

export interface InventoryRow {
  id: string
  name: string
  mediaType: string
  allocationModel: string
  mediaOwnerName: string
  rateLabel: string
  availability: Availability
  staleVerificationWarnings: StaleVerificationWarning[]
}

/**
 * Inventory across every product for a period.
 *
 * This is the asset and availability context a manager needs before promising
 * anything: what exists, what is free, and what nobody has verified recently.
 */
export async function getInventory(
  prisma: PrismaClient,
  range: DateRange,
): Promise<InventoryRow[]> {
  const products = await prisma.product.findMany({
    include: { ...availabilityInclude, mediaOwner: true },
    orderBy: { name: 'asc' },
  })

  return Promise.all(
    products.map(async (product) => {
      const at = now()

      const availability: Availability =
        product.allocationModel === 'capacity_pool'
          ? capacityPoolAvailability({
              range,
              now: at,
              capacity: product.capacityPools[0]?.capacity ?? 0,
              bookings: product.bookings.filter(
                (b) => b.capacityPoolId === product.capacityPools[0]?.id,
              ),
              holds: product.holds.filter(
                (h) => h.capacityPoolId === product.capacityPools[0]?.id,
              ),
            })
          : exclusiveAssetAvailability({
              range,
              now: at,
              assets: product.assets,
              bookings: product.bookings,
              holds: product.holds,
              outages: product.assets.flatMap((a) => a.outages),
            })

      return {
        id: product.id,
        name: product.name,
        mediaType: product.mediaType,
        allocationModel: product.allocationModel,
        mediaOwnerName: product.mediaOwner.name,
        rateLabel: product.rateLabel,
        availability,
        staleVerificationWarnings: await staleVerification(prisma, product.id),
      }
    }),
  )
}

// ------------------------------------------------ answering a change request

export type ChangeResponse =
  | { action: 'revise'; startDate?: string; endDate?: string; assetId?: string | null; note?: string }
  | { action: 'decline'; note?: string }

/**
 * Answer a client's change request.
 *
 * Without this the contract stalled: the client had asked for something, the
 * status said `change_requested`, and there was nowhere for a manager to act.
 * The state machine already allowed change_requested -> issued; this is the
 * path that uses it.
 *
 * Revising re-issues a NEW VERSION with the new terms, because a changed offer
 * is a different offer and the client should be accepting the one they can
 * see. Declining leaves the terms untouched and hands the same version back —
 * it is an answer, not a new offer, so the version does not move.
 *
 * New dates are rechecked against inventory inside the transaction. Moving a
 * contract into a period somebody else has taken is exactly the mistake this
 * prevents, and it fails without changing anything.
 */
export async function respondToChangeRequest(
  prisma: PrismaClient,
  contractId: string,
  response: ChangeResponse,
) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      items: { include: { product: true } },
      clientRequests: { where: { status: 'submitted' }, orderBy: { createdAt: 'desc' } },
    },
  })
  if (!contract) throw notFound('That contract could not be found.')

  if (contract.status !== 'change_requested') {
    throw conflict('This contract is not waiting on a change request.')
  }

  const note = response.note?.trim()
  if (!note) {
    throw validationError('Add a note explaining your decision.', [
      'The client sees that you replied, and the reason stays in the history.',
    ])
  }

  const at = now()

  if (response.action === 'decline') {
    const outcome = applyContractAction(
      { status: contract.status as ContractStatus, version: contract.version },
      'issue',
      'manager',
    )
    if (!outcome.ok) throw conflict(outcome.reason)

    return prisma.$transaction(async (tx) => {
      // Terms untouched, and the version stands: declining is an answer, not a
      // new offer.
      const updated = await tx.contract.update({
        where: { id: contractId },
        data: { status: 'issued', issuedAt: at },
      })

      for (const request of contract.clientRequests) {
        await tx.clientRequest.update({ where: { id: request.id }, data: { status: 'declined' } })
      }

      await tx.historyEvent.create({
        data: {
          entityType: 'contract',
          entityId: contractId,
          at,
          actor: 'manager',
          action: 'issued',
          note,
        },
      })

      await tx.serviceEvent.create({
        data: {
          id: newId('event'),
          organisationId: contract.organisationId,
          contractId,
          campaignId: null,
          workOrderId: null,
          at,
          type: 'change_declined',
          title: 'Change request answered',
          clientVisible: true,
          clientSummary: `We could not make that change. ${note}`,
        },
      })

      return updated
    })
  }

  const range = {
    startDate: response.startDate?.trim() || contract.startDate,
    endDate: response.endDate?.trim() || contract.endDate,
  }
  if (!isValidRange(range)) {
    throw validationError('A contract must end after it starts.')
  }

  const outcome = applyContractAction(
    { status: contract.status as ContractStatus, version: contract.version },
    'issue',
    'manager',
  )
  if (!outcome.ok) throw conflict(outcome.reason)

  return prisma.$transaction(async (tx) => {
    let total = 0

    for (const item of contract.items) {
      const assetId = response.assetId === undefined ? item.assetId : response.assetId

      // The recheck ignores this contract's own confirmed booking, which does
      // not exist yet: nothing is booked until the client accepts.
      const availability = await computeAvailability(tx, item.productId, range, assetId)
      if (!availability.available) {
        const detail =
          availability.allocationModel === 'exclusive_asset'
            ? availability.candidates.flatMap((c) =>
                c.blockedBy ? [`${c.assetName} ${blockedReasonLabel(c.blockedBy)}.`] : [],
              )
            : [`The shared capacity is full: ${availability.peakUsed} of ${availability.capacity}.`]

        throw conflict(
          `${item.product.name} is not available for ${range.startDate} to ${range.endDate}.`,
          detail,
        )
      }

      const lineTotal = contractTotal(item.product.rateMonthlyEquivalent, range)
      total += lineTotal

      await tx.contractItem.update({
        where: { id: item.id },
        data: { assetId, lineTotal },
      })
    }

    const updated = await tx.contract.update({
      where: { id: contractId },
      data: {
        status: 'issued',
        version: outcome.version,
        startDate: range.startDate,
        endDate: range.endDate,
        total,
        issuedAt: at,
      },
    })

    for (const request of contract.clientRequests) {
      await tx.clientRequest.update({ where: { id: request.id }, data: { status: 'accepted' } })
    }

    await tx.historyEvent.create({
      data: {
        entityType: 'contract',
        entityId: contractId,
        at,
        actor: 'manager',
        action: 'issued',
        note,
      },
    })

    await tx.serviceEvent.create({
      data: {
        id: newId('event'),
        organisationId: contract.organisationId,
        contractId,
        campaignId: null,
        workOrderId: null,
        at,
        type: 'contract_reissued',
        title: 'Updated contract ready for review',
        clientVisible: true,
        clientSummary: `We have updated your contract. Version ${outcome.version} is ready to review.`,
      },
    })

    return updated
  })
}
