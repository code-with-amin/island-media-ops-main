import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readJson, route } from '@/server/http'
import { requireClient } from '@/server/session'
import { addToShortlist, listShortlist, removeFromShortlist } from '@/server/services/shortlist'

/**
 * Shortlist. Not in the supplied OpenAPI document, added because Scenario A
 * requires shortlisting before a request is submitted. Documented in the
 * README as an addition to the contract.
 */
export const GET = route(async () => {
  const session = await requireClient()
  return NextResponse.json({ items: await listShortlist(prisma, session.organisationId) })
})

export const POST = route(async (request: Request) => {
  const session = await requireClient()
  const body = await readJson<{ productId: string; startDate?: string; endDate?: string }>(request)
  return NextResponse.json(await addToShortlist(prisma, session.organisationId, body), {
    status: 201,
  })
})

export const DELETE = route(async (request: Request) => {
  const session = await requireClient()
  const productId = new URL(request.url).searchParams.get('productId') ?? ''
  await removeFromShortlist(prisma, session.organisationId, productId)
  return NextResponse.json({ ok: true })
})
