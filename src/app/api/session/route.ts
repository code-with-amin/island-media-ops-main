import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { readJson, route } from '@/server/http'
import { clearSession, getSession, setSessionUser } from '@/server/session'
import { listSwitchableUsers, resolveUser } from '@/server/services/auth'
import { notFound } from '@/server/errors'

/** The current session plus the accounts the prototype switcher offers. */
export const GET = route(async () => {
  const [session, available] = await Promise.all([getSession(), listSwitchableUsers(prisma)])
  return NextResponse.json({ session, available })
})

/** Switch to a seeded account, or sign out when userId is null. */
export const POST = route(async (request: Request) => {
  const { userId } = await readJson<{ userId: string | null }>(request)

  if (!userId) {
    await clearSession()
    return NextResponse.json({ session: null })
  }

  const user = await resolveUser(prisma, userId)
  if (!user) throw notFound('That account could not be found.')

  await setSessionUser(user.id)
  return NextResponse.json({
    session: {
      userId: user.id,
      name: user.name,
      role: user.role,
      organisationId: user.organisationId,
    },
  })
})
