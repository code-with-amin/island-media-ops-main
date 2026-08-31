/**
 * CLI entry point for `npm run db:seed`. The seeding logic lives in
 * src/server/seed.ts so that tests can reset to the same known state.
 */
/**
 * Load .env for scripts run directly by tsx.
 *
 * The Prisma CLI and Next both read .env themselves, so migrations and the
 * running app find DATABASE_URL. A bare tsx process does not, which meant the
 * seed worked on a machine that already had the variable exported and failed
 * on a fresh clone — the first command a reviewer runs.
 */
function loadLocalEnv() {
  try {
    process.loadEnvFile('.env')
  } catch {
    // No .env is fine: the deployed preview passes its variables directly.
  }
}

loadLocalEnv()

import { createPrismaClient } from '../src/server/prismaClient.js'
import { seedDatabase, fixtures } from '../src/server/seed.js'

// Picks up TURSO_DATABASE_URL when seeding the deployed preview, and the local
// SQLite file otherwise.
const prisma = createPrismaClient()

seedDatabase(prisma)
  .then(async () => {
    console.log(`Seeded at fixture clock ${fixtures.fixtureClock}`)
    console.table({
      products: await prisma.product.count(),
      assets: await prisma.asset.count(),
      bookings: await prisma.booking.count(),
      holds: await prisma.hold.count(),
      organisations: await prisma.organisation.count(),
      contracts: await prisma.contract.count(),
      workOrders: await prisma.workOrder.count(),
      history: await prisma.historyEvent.count(),
    })
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
