import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readJson, route } from '@/server/http'
import { requireRole } from '@/server/session'
import { updateWorkOrderStatus } from '@/server/services/fieldWork'
import type { WorkOrderTransition } from '@/domain/workOrder'

/**
 * Move a job through its states.
 *
 * The guards live in the domain layer, so blocking without a reason and
 * completing without a note or proof are refused here exactly as they are in
 * the tests — the mobile form cannot get ahead of the rules.
 */
export const POST = route(
  async (request: Request, context: { params: Promise<{ workOrderId: string }> }) => {
    const session = await requireRole('fitter')
    const { workOrderId } = await context.params
    const body = await readJson<WorkOrderTransition>(request)
    return NextResponse.json(
      await updateWorkOrderStatus(prisma, workOrderId, session.userId, body),
    )
  },
)
