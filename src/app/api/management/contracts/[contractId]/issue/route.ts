import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { route } from '@/server/http'
import { requireRole } from '@/server/session'
import { issueContract } from '@/server/services/management'

export const POST = route(
  async (_request: Request, context: { params: Promise<{ contractId: string }> }) => {
    await requireRole('manager')
    const { contractId } = await context.params
    return NextResponse.json(await issueContract(prisma, contractId))
  },
)
