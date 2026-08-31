import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readRange, route } from '@/server/http'
import { getProductDetail } from '@/server/services/catalogue'

export const GET = route(
  async (request: Request, context: { params: Promise<{ productId: string }> }) => {
    const { productId } = await context.params
    const range = readRange(new URL(request.url))
    return NextResponse.json(await getProductDetail(prisma, productId, range))
  },
)
