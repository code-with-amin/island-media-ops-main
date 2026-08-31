import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { route } from '@/server/http'
import { requireRole } from '@/server/session'
import { getWorkOrderForFitter } from '@/server/services/fieldWork'

export const GET = route(
  async (_request: Request, context: { params: Promise<{ workOrderId: string }> }) => {
    const session = await requireRole('fitter')
    const { workOrderId } = await context.params
    return NextResponse.json(await getWorkOrderForFitter(prisma, workOrderId, session.userId))
  },
)
