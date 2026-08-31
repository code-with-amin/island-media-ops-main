import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readJson, route } from '@/server/http'
import { requireRole } from '@/server/session'
import { respondToChangeRequest, type ChangeResponse } from '@/server/services/management'

/**
 * Answer a client's change request: revise and re-issue, or decline.
 *
 * Revising rechecks the new dates against inventory inside the transaction and
 * returns 409 if they are no longer free, leaving the contract untouched.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ contractId: string }> }) => {
    await requireRole('manager')
    const { contractId } = await context.params
    const body = await readJson<ChangeResponse>(request)
    return NextResponse.json(await respondToChangeRequest(prisma, contractId, body))
  },
)
