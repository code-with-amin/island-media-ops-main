import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readJson, requireIdempotencyKey, route } from '@/server/http'
import { requireRole } from '@/server/session'
import { createContractFromRequest } from '@/server/services/management'
import { findExistingEntityId } from '@/server/idempotency'

/** Draft a contract from an approved request. */
export const POST = route(async (request: Request) => {
  await requireRole('manager')
  const idempotencyKey = requireIdempotencyKey(request)
  const body = await readJson<{ bookingRequestId: string; assetId?: string | null }>(request)

  const existingId = await findExistingEntityId(prisma, 'contract', idempotencyKey)
  if (existingId) {
    const existing = await prisma.contract.findUnique({ where: { id: existingId } })
    if (existing) return NextResponse.json(existing, { status: 200 })
  }

  const contract = await createContractFromRequest(prisma, body.bookingRequestId, {
    assetId: body.assetId ?? null,
  })

  await prisma.idempotencyRecord.create({
    data: {
      scope: 'contract',
      key: idempotencyKey,
      entityId: contract.id,
      createdAt: contract.createdAt,
    },
  })

  return NextResponse.json(contract, { status: 201 })
})
