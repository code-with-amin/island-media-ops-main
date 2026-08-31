import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { route } from '@/server/http'
import { requireRole } from '@/server/session'
import { getDashboard } from '@/server/services/management'

export const GET = route(async () => {
  await requireRole('manager')
  return NextResponse.json(await getDashboard(prisma))
})
