import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { route } from '@/server/http'
import { requireRole } from '@/server/session'
import { seedDatabase } from '@/server/seed'

/**
 * Return the prototype to its seeded state.
 *
 * Exists so a reviewer can restart a walkthrough without a terminal, and so
 * the deployed preview does not degrade as people click through it — the
 * alternative is the next reviewer inheriting accepted contracts and
 * completed jobs with no way back.
 *
 * Gated on the manager role rather than the environment. That is not real
 * security: the role switcher lets anyone become the manager, by design. It
 * does mean the endpoint is not a naked public "delete everything" URL, and
 * it is consistent with how the rest of this prototype treats authorisation.
 *
 * In production this endpoint would not exist at all. Seeded demo data would
 * live in a separate environment from real client records, and resetting it
 * would be an operational task rather than an HTTP call.
 */
export const POST = route(async () => {
  await requireRole('manager')

  await seedDatabase(prisma)

  return NextResponse.json({
    ok: true,
    message: 'Prototype data reset to the seeded fixtures.',
  })
})
