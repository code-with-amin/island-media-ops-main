import { PrismaClient } from '@prisma/client'
import { PrismaLibSQL } from '@prisma/adapter-libsql'

/**
 * Builds the Prisma client for whichever database this process should use.
 *
 * Local development and the tests use a plain SQLite file, so the repository
 * clones and runs with no database server and no accounts. The deployed
 * preview needs somewhere durable — a serverless filesystem is read-only and
 * its /tmp is wiped between instances — so it points at Turso, which is
 * hosted libSQL and speaks the same SQLite dialect.
 *
 * That is the whole reason for choosing Turso over Postgres here: the schema,
 * the migrations and the local workflow are identical either way. Only the
 * connection changes.
 */
export function createPrismaClient(options: { datasourceUrl?: string } = {}): PrismaClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL

  // An explicit datasourceUrl always wins: the tests use it to reach their own
  // throwaway file, and must never touch a hosted database.
  if (tursoUrl && !options.datasourceUrl) {
    const adapter = new PrismaLibSQL({
      url: tursoUrl,
      authToken: process.env.TURSO_AUTH_TOKEN,
    })
    return new PrismaClient({ adapter, log: ['error'] })
  }

  return new PrismaClient({
    ...(options.datasourceUrl ? { datasourceUrl: options.datasourceUrl } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}
