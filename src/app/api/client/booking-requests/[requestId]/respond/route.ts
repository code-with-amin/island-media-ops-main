import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readJson, route } from '@/server/http'
import { requireClient } from '@/server/session'
import { respondToInformationRequest } from '@/server/services/clientPortal'

/**
 * Answer a question the agency asked about an enquiry.
 *
 * Closes the loop opened by a manager setting a request to
 * `information_required`: the answer is recorded in history and the enquiry
 * returns to the agency's decision queue.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ requestId: string }> }) => {
    const session = await requireClient()
    const { requestId } = await context.params
    const { answer } = await readJson<{ answer: string }>(request)

    return NextResponse.json(
      await respondToInformationRequest(prisma, session.organisationId, requestId, answer ?? ''),
    )
  },
)
