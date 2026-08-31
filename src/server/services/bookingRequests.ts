import type { BookingRequest, PrismaClient } from '@prisma/client'
import { isValidRange } from '@/domain/dates'
import type { Actor } from '@/domain/contract'
import { now } from '@/domain/clock'
import { newId } from '../ids'
import { notFound, validationError } from '../errors'
import { findExistingEntityId, isUniqueViolation } from '../idempotency'

const SCOPE = 'booking_request'

export interface BookingRequestInput {
  organisationId: string | null
  advertiserName: string
  advertiserContactName: string
  advertiserEmail: string
  productId: string
  requestedAssetId: string | null
  startDate: string
  endDate: string
  budget: number | null
  objective: string | null
  notes: string | null
}

export interface SubmitResult {
  created: boolean
  request: BookingRequest
}

/**
 * Submit a non-binding request.
 *
 * Deliberately does NOT check availability. A request is an enquiry, and
 * refusing to record one because inventory looks tight would hide demand from
 * the agency. Availability is rechecked at approval, where it can actually
 * block a commitment.
 */
export async function submitBookingRequest(
  prisma: PrismaClient,
  args: { input: BookingRequestInput; idempotencyKey: string; actor: Actor },
): Promise<SubmitResult> {
  const { input, idempotencyKey, actor } = args

  const existingId = await findExistingEntityId(prisma, SCOPE, idempotencyKey)
  if (existingId) {
    const existing = await prisma.bookingRequest.findUnique({ where: { id: existingId } })
    if (existing) return { created: false, request: existing }
  }

  if (!isValidRange(input)) {
    throw validationError('A request must end after it starts.', [
      'Provide valid start and end dates, where the end date is later than the start date.',
    ])
  }

  const product = await prisma.product.findUnique({ where: { id: input.productId } })
  if (!product) throw notFound('That product could not be found.')

  if (input.requestedAssetId) {
    const asset = await prisma.asset.findUnique({ where: { id: input.requestedAssetId } })
    if (!asset || asset.productId !== product.id) {
      throw validationError('The requested asset does not belong to that product.')
    }
  }

  const at = now()
  const id = newId('request')

  try {
    const request = await prisma.$transaction(async (tx) => {
      const created = await tx.bookingRequest.create({
        data: {
          id,
          idempotencyKey,
          organisationId: input.organisationId,
          advertiserName: input.advertiserName,
          advertiserContactName: input.advertiserContactName,
          advertiserEmail: input.advertiserEmail,
          productId: input.productId,
          requestedAssetId: input.requestedAssetId,
          startDate: input.startDate,
          endDate: input.endDate,
          budget: input.budget,
          objective: input.objective,
          notes: input.notes,
          status: 'submitted',
          createdAt: at,
        },
      })

      await tx.historyEvent.create({
        data: { entityType: SCOPE, entityId: id, at, actor, action: 'submitted', note: null },
      })

      await tx.idempotencyRecord.create({
        data: { scope: SCOPE, key: idempotencyKey, entityId: id, createdAt: at },
      })

      return created
    })

    return { created: true, request }
  } catch (error) {
    // Two concurrent submissions with the same key: the loser reads the
    // record the winner created rather than failing the caller.
    if (isUniqueViolation(error)) {
      const winnerId = await findExistingEntityId(prisma, SCOPE, idempotencyKey)
      if (winnerId) {
        const existing = await prisma.bookingRequest.findUnique({ where: { id: winnerId } })
        if (existing) return { created: false, request: existing }
      }
    }
    throw error
  }
}
