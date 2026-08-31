/**
 * Deterministic seed.
 *
 * Runs from the supplied fixture file and preserves every supplied ID, so a
 * reviewer can follow `request-001` or `asset-door-b` from the brief straight
 * through to the running application.
 *
 * Determinism matters twice over: the availability tests assert against these
 * exact rows, and `npm run db:reset` has to put the demo back to a known state
 * before a walkthrough.
 *
 * The fixtures contain deliberate friction — an expired hold, a retired asset,
 * a confirmed outage, an unfulfillable request, a price-on-request product.
 * None of it is cleaned up here. See docs/superpowers/specs for what each
 * planted record is meant to prove.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PrismaClient } from '@prisma/client'
import type { Fixtures, FixtureHistory } from './fixtures'

/** Resolved from the project root, which is the working directory for both
 *  `npm run db:seed` and the test runner. */
const fixturesPath = join(process.cwd(), 'fixtures', 'island-media-fixtures.json')

export const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8')) as Fixtures

const fx = fixtures

const date = (v: string | null | undefined): Date | null => (v ? new Date(v) : null)

/**
 * History rows get explicit, derived IDs rather than generated ones so that a
 * reseed produces a byte-identical database.
 */
function historyRows(entityType: string, entityId: string, history: FixtureHistory[]) {
  return history.map((h, i) => ({
    id: `history-${entityType}-${entityId}-${i + 1}`,
    entityType,
    entityId,
    at: new Date(h.at),
    actor: h.actor,
    action: h.action,
    note: h.note,
  }))
}

async function clear(prisma: PrismaClient) {
  // Child-first, so foreign keys never block the reset.
  await prisma.historyEvent.deleteMany()
  await prisma.idempotencyRecord.deleteMany()
  await prisma.proofRecord.deleteMany()
  await prisma.serviceEvent.deleteMany()
  await prisma.clientRequest.deleteMany()
  await prisma.workOrder.deleteMany()
  await prisma.campaign.deleteMany()
  await prisma.contractItem.deleteMany()
  await prisma.contract.deleteMany()
  await prisma.bookingRequest.deleteMany()
  await prisma.shortlistItem.deleteMany()
  await prisma.outage.deleteMany()
  await prisma.hold.deleteMany()
  await prisma.booking.deleteMany()
  await prisma.asset.deleteMany()
  await prisma.capacityPool.deleteMany()
  await prisma.productLocation.deleteMany()
  await prisma.product.deleteMany()
  await prisma.user.deleteMany()
  await prisma.organisation.deleteMany()
  await prisma.location.deleteMany()
  await prisma.mediaOwner.deleteMany()
}

export async function seedDatabase(prisma: PrismaClient) {
  await clear(prisma)

  await prisma.mediaOwner.createMany({ data: fx.mediaOwners })
  await prisma.location.createMany({ data: fx.locations })

  await prisma.product.createMany({
    data: fx.products.map((p) => ({
      id: p.id,
      name: p.name,
      mediaOwnerId: p.mediaOwnerId,
      mediaType: p.mediaType,
      allocationModel: p.allocationModel,
      description: p.description,
      minimumTermDays: p.minimumTermDays,
      rateCurrency: p.indicativeRate.currency,
      rateAmount: p.indicativeRate.amount,
      rateUnit: p.indicativeRate.unit,
      rateMonthlyEquivalent: p.indicativeRate.monthlyEquivalent,
      rateLabel: p.indicativeRate.label,
      creativeSpec: p.creativeSpec ? JSON.stringify(p.creativeSpec) : null,
    })),
  })

  await prisma.productLocation.createMany({
    data: fx.products.flatMap((p) =>
      p.locationIds.map((locationId) => ({ productId: p.id, locationId })),
    ),
  })

  await prisma.capacityPool.createMany({
    data: fx.capacityPools.map((c) => ({ ...c, verifiedAt: date(c.verifiedAt) })),
  })

  await prisma.asset.createMany({
    data: fx.assets.map((a) => ({
      id: a.id,
      productId: a.productId,
      name: a.name,
      locationId: a.locationId,
      status: a.status,
      verifiedAt: date(a.verifiedAt),
      verificationSource: a.verificationSource,
      note: a.note ?? null,
    })),
  })

  await prisma.booking.createMany({
    data: fx.bookings.map((b) => ({
      id: b.id,
      campaignName: b.campaignName,
      productId: b.productId,
      assetId: b.assetId ?? null,
      capacityPoolId: b.capacityPoolId ?? null,
      capacityUnits: b.capacityUnits ?? null,
      startDate: b.startDate,
      endDate: b.endDate,
      status: b.status,
    })),
  })

  await prisma.hold.createMany({
    data: fx.holds.map((h) => ({
      id: h.id,
      productId: h.productId,
      assetId: h.assetId ?? null,
      capacityPoolId: h.capacityPoolId ?? null,
      capacityUnits: h.capacityUnits ?? null,
      startDate: h.startDate,
      endDate: h.endDate,
      expiresAt: new Date(h.expiresAt),
      status: h.status,
    })),
  })

  await prisma.outage.createMany({ data: fx.outages })

  await prisma.organisation.createMany({
    data: fx.organisations.map((o) => ({
      id: o.id,
      name: o.name,
      createdAt: new Date(o.createdAt),
    })),
  })

  await prisma.user.createMany({ data: fx.users })

  await prisma.bookingRequest.createMany({
    data: fx.bookingRequests.map((r) => ({
      id: r.id,
      idempotencyKey: r.idempotencyKey,
      organisationId: r.organisationId,
      advertiserName: r.advertiser.name,
      advertiserContactName: r.advertiser.contactName,
      advertiserEmail: r.advertiser.email,
      productId: r.productId,
      requestedAssetId: r.requestedAssetId,
      startDate: r.startDate,
      endDate: r.endDate,
      budget: r.budget,
      objective: r.objective,
      notes: r.notes,
      status: r.status,
      createdAt: new Date(r.createdAt),
    })),
  })

  await prisma.contract.createMany({
    data: fx.contracts.map((c) => ({
      id: c.id,
      organisationId: c.organisationId,
      bookingRequestId: c.bookingRequestId,
      status: c.status,
      version: c.version,
      startDate: c.startDate,
      endDate: c.endDate,
      currency: c.currency,
      total: c.total,
      // Fixtures carry no createdAt; the first history entry is the creation.
      createdAt: new Date(c.history[0]?.at ?? c.issuedAt ?? fx.fixtureClock),
      issuedAt: date(c.issuedAt),
      acceptedAt: date(c.acceptedAt),
      activatedAt: date(c.activatedAt),
    })),
  })

  await prisma.contractItem.createMany({
    data: fx.contracts.flatMap((c) => c.items.map((i) => ({ ...i, contractId: c.id }))),
  })

  await prisma.campaign.createMany({ data: fx.campaigns })

  await prisma.workOrder.createMany({
    data: fx.workOrders.map((w) => ({
      id: w.id,
      campaignId: w.campaignId,
      contractId: w.contractId,
      organisationId: w.organisationId,
      type: w.type,
      status: w.status,
      assignedUserId: w.assignedUserId,
      assetId: w.assetId,
      scheduledStart: new Date(w.scheduledStart),
      scheduledEnd: new Date(w.scheduledEnd),
      locationLabel: w.locationLabel,
      instructions: w.instructions,
      internalNotes: w.internalNotes,
      completionNote: w.completionNote,
      blockedReason: null,
      createdAt: new Date(w.history[0]?.at ?? fx.fixtureClock),
    })),
  })

  await prisma.serviceEvent.createMany({
    data: fx.serviceEvents.map((e) => ({ ...e, at: new Date(e.at) })),
  })

  await prisma.clientRequest.createMany({
    data: fx.clientRequests.map((r) => ({
      id: r.id,
      organisationId: r.organisationId,
      contractId: r.contractId,
      type: r.type,
      status: r.status,
      createdAt: new Date(r.createdAt),
      summary: r.summary,
    })),
  })

  await prisma.historyEvent.createMany({
    data: [
      ...fx.bookingRequests.flatMap((r) => historyRows('booking_request', r.id, r.history)),
      ...fx.contracts.flatMap((c) => historyRows('contract', c.id, c.history)),
      ...fx.workOrders.flatMap((w) => historyRows('work_order', w.id, w.history)),
      ...fx.clientRequests.flatMap((r) => historyRows('client_request', r.id, r.history)),
    ],
  })

  // Seeded requests already carry an idempotency key. Recording it means a
  // replayed seed key returns the existing request rather than duplicating it.
  await prisma.idempotencyRecord.createMany({
    data: fx.bookingRequests
      .filter((r) => r.idempotencyKey)
      .map((r) => ({
        id: `idem-booking_request-${r.idempotencyKey}`,
        scope: 'booking_request',
        key: r.idempotencyKey as string,
        entityId: r.id,
        createdAt: new Date(r.createdAt),
      })),
  })
}
