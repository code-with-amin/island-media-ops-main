import type { PrismaClient } from '@prisma/client'
import { now } from '@/domain/clock'
import { newId } from '../ids'
import { notFound } from '../errors'

/**
 * A client's saved products.
 *
 * Scoped to the organisation like everything else in the portal, and unique
 * per product so adding the same item twice is a no-op rather than a
 * duplicate row.
 */
export async function listShortlist(prisma: PrismaClient, organisationId: string) {
  return prisma.shortlistItem.findMany({
    where: { organisationId },
    include: { product: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function addToShortlist(
  prisma: PrismaClient,
  organisationId: string,
  input: { productId: string; startDate?: string; endDate?: string },
) {
  const product = await prisma.product.findUnique({ where: { id: input.productId } })
  if (!product) throw notFound('That product could not be found.')

  return prisma.shortlistItem.upsert({
    where: { organisationId_productId: { organisationId, productId: input.productId } },
    update: { startDate: input.startDate ?? null, endDate: input.endDate ?? null },
    create: {
      id: newId('shortlist'),
      organisationId,
      productId: input.productId,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      createdAt: now(),
    },
  })
}

export async function removeFromShortlist(
  prisma: PrismaClient,
  organisationId: string,
  productId: string,
) {
  await prisma.shortlistItem.deleteMany({ where: { organisationId, productId } })
}
