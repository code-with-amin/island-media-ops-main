import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { route } from '@/server/http'
import { requireRole } from '@/server/session'
import { listWorkOrdersForFitter } from '@/server/services/fieldWork'

/** Today's and upcoming jobs for the signed-in fitter, and nobody else's. */
export const GET = route(async () => {
  const session = await requireRole('fitter')
  return NextResponse.json({ items: await listWorkOrdersForFitter(prisma, session.userId) })
})
