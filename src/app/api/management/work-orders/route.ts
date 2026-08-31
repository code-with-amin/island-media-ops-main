import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readJson, route } from '@/server/http'
import { requireRole } from '@/server/session'
import { createWorkOrder, type CreateWorkOrderInput } from '@/server/services/fieldWork'

export const GET = route(async () => {
  await requireRole('manager')
  const items = await prisma.workOrder.findMany({
    include: { assignedUser: true, campaign: true, asset: true, proofRecords: true },
    orderBy: { scheduledStart: 'asc' },
  })
  return NextResponse.json({ items })
})

export const POST = route(async (request: Request) => {
  await requireRole('manager')
  const body = await readJson<CreateWorkOrderInput>(request)
  return NextResponse.json(await createWorkOrder(prisma, body), { status: 201 })
})
