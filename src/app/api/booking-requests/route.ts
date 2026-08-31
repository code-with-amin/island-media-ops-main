import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readJson, requireIdempotencyKey, route } from '@/server/http'
import { requireClient } from '@/server/session'
import { submitBookingRequest } from '@/server/services/bookingRequests'

/**
 * Submit a non-binding request.
 *
 * Requires an Idempotency-Key: a client who loses connection mid-submit and
 * presses the button again must not create two requests. A repeated key
 * returns 200 with the original record; a new key returns 201.
 */
export const POST = route(async (request: Request) => {
  const session = await requireClient()
  const idempotencyKey = requireIdempotencyKey(request)
  const body = await readJson<{
    productId: string
    startDate: string
    endDate: string
    budget?: number | null
    objective?: string | null
    notes?: string | null
    requestedAssetId?: string | null
  }>(request)

  const organisation = await prisma.organisation.findUniqueOrThrow({
    where: { id: session.organisationId },
  })
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } })

  const { created, request: bookingRequest } = await submitBookingRequest(prisma, {
    idempotencyKey,
    actor: 'client',
    input: {
      organisationId: session.organisationId,
      advertiserName: organisation.name,
      advertiserContactName: user.name,
      advertiserEmail: user.email,
      productId: body.productId,
      requestedAssetId: body.requestedAssetId ?? null,
      startDate: body.startDate,
      endDate: body.endDate,
      budget: body.budget ?? null,
      objective: body.objective ?? null,
      notes: body.notes ?? null,
    },
  })

  return NextResponse.json(bookingRequest, { status: created ? 201 : 200 })
})
