import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { route } from '@/server/http'
import { requireClient } from '@/server/session'
import { listClientContracts } from '@/server/services/clientPortal'

export const GET = route(async () => {
  const session = await requireClient()
  return NextResponse.json({ items: await listClientContracts(prisma, session.organisationId) })
})
