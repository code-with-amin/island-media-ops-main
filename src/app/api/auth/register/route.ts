import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readJson, route } from '@/server/http'
import { setSessionUser } from '@/server/session'
import { registerClient, type RegisterInput } from '@/server/services/auth'

/** Create a fictional client account and sign the visitor straight in. */
export const POST = route(async (request: Request) => {
  const body = await readJson<RegisterInput>(request)
  const { user, organisation } = await registerClient(prisma, body)
  await setSessionUser(user.id)

  return NextResponse.json(
    {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      organisation: { id: organisation.id, name: organisation.name },
    },
    { status: 201 },
  )
})
