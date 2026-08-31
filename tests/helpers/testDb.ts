import type { PrismaClient } from '@prisma/client'
import { createPrismaClient } from '@/server/prismaClient'
import { seedDatabase } from '@/server/seed'

/**
 * Integration tests run against their own SQLite file, never the development
 * database. SQLite paths are resolved relative to the schema directory, so
 * this lands at prisma/test.db.
 */
export const TEST_DATABASE_URL = 'file:./test.db'

export function createTestPrisma(): PrismaClient {
  // Always the local throwaway file, never a hosted database, even when Turso
  // credentials happen to be present in the environment.
  return createPrismaClient({ datasourceUrl: TEST_DATABASE_URL })
}

/** Returns the database to the exact seeded fixture state. */
export async function resetTestDb(prisma: PrismaClient): Promise<void> {
  await seedDatabase(prisma)
}
