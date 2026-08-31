import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readJson, route } from '@/server/http'
import { requireRole } from '@/server/session'
import {
  decideBookingRequest,
  getBookingRequestDetail,
  type RequestDecision,
} from '@/server/services/management'

/** Request detail with availability recomputed for the requested dates. */
export const GET = route(
  async (_request: Request, context: { params: Promise<{ requestId: string }> }) => {
    await requireRole('manager')
    const { requestId } = await context.params
    return NextResponse.json(await getBookingRequestDetail(prisma, requestId))
  },
)

/**
 * Approve, decline, or ask the client for more information.
 *
 * Approval rechecks availability inside the transaction and returns 409 with
 * the blocking records when the inventory has gone.
 */
export const PATCH = route(
  async (request: Request, context: { params: Promise<{ requestId: string }> }) => {
    await requireRole('manager')
    const { requestId } = await context.params
    const body = await readJson<RequestDecision>(request)
    return NextResponse.json(await decideBookingRequest(prisma, requestId, body))
  },
)
