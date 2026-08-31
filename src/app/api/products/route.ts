import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readRange, route } from '@/server/http'
import { searchProducts } from '@/server/services/catalogue'

/** Public catalogue search with availability calculated for the dates. */
export const GET = route(async (request: Request) => {
  const url = new URL(request.url)
  const range = readRange(url)

  const budgetParam = url.searchParams.get('maxMonthlyBudget')
  const query = {
    ...range,
    mediaType: url.searchParams.get('mediaType') ?? undefined,
    locationId: url.searchParams.get('locationId') ?? undefined,
    maxMonthlyBudget: budgetParam ? Number(budgetParam) : undefined,
  }

  const items = await searchProducts(prisma, query)
  return NextResponse.json({ query, items })
})
