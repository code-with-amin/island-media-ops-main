import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { route } from '@/server/http'
import { requireRole } from '@/server/session'
import { listBookingRequests } from '@/server/services/management'

export const GET = route(async (request: Request) => {
  await requireRole('manager')
  const status = new URL(request.url).searchParams.get('status') ?? undefined
  return NextResponse.json({ items: await listBookingRequests(prisma, status) })
})
