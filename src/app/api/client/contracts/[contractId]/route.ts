import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { route } from '@/server/http'
import { requireClient } from '@/server/session'
import { getClientContract } from '@/server/services/clientPortal'

export const GET = route(
  async (_request: Request, context: { params: Promise<{ contractId: string }> }) => {
    const session = await requireClient()
    const { contractId } = await context.params
    // Scoped by organisation inside the service: another organisation's
    // contract reports as not found rather than forbidden.
    return NextResponse.json(await getClientContract(prisma, session.organisationId, contractId))
  },
)
