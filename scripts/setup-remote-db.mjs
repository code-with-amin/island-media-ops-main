/**
 * Prepares the deployed preview's database.
 *
 * Applies the committed migrations to Turso and then seeds the fixtures, so
 * the preview opens with the same data a reviewer gets locally.
 *
 * `prisma migrate deploy` speaks to a database over Prisma's own connectors
 * and cannot reach libSQL, so the migration SQL is executed directly here.
 * The migrations are the same files used locally — this only changes where
 * they are applied, not what they contain.
 *
 *   TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… npm run db:remote
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@libsql/client'

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


const url = process.env.TURSO_DATABASE_URL
const authToken = process.env.TURSO_AUTH_TOKEN

if (!url) {
  console.error('TURSO_DATABASE_URL is not set. Copy it from the Turso dashboard.')
  process.exit(1)
}

const migrationsDir = join(process.cwd(), 'prisma', 'migrations')
const migrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

const client = createClient({ url, authToken })

console.log(`Applying ${migrations.length} migration(s) to ${url}`)
for (const name of migrations) {
  const sql = readFileSync(join(migrationsDir, name, 'migration.sql'), 'utf8')
  await client.executeMultiple(sql)
  console.log(`  applied ${name}`)
}

client.close()

// The seed runs through the normal Prisma client, which picks up the same
// Turso credentials from the environment.
const { createPrismaClient } = await import('../src/server/prismaClient.js')
const { seedDatabase, fixtures } = await import('../src/server/seed.js')

const prisma = createPrismaClient()
await seedDatabase(prisma)

console.log(`\nSeeded at fixture clock ${fixtures.fixtureClock}`)
console.table({
  products: await prisma.product.count(),
  assets: await prisma.asset.count(),
  organisations: await prisma.organisation.count(),
  users: await prisma.user.count(),
  contracts: await prisma.contract.count(),
  workOrders: await prisma.workOrder.count(),
})

await prisma.$disconnect()
